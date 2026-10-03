import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { google } from 'googleapis';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const auth = new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// Helper to safely parse request body without throwing
async function safeGetBody(request: Request): Promise<{ text: string; error?: string }> {
    try {
        const contentType = request.headers.get('content-type') || '';
        
        // Always read as text first to avoid JSON parse errors
        const text = await request.text();
        
        if (!text || text.trim() === '') {
            return { text: '', error: 'Empty body' };
        }
        
        // If it looks like JSON and content-type says so, try to parse
        if (contentType.includes('application/json')) {
            // Check if it's just empty JSON object
            if (text.trim() === '{}' || text.trim() === '[]') {
                return { text: '', error: 'Empty JSON object/array' };
            }
            
            try {
                JSON.parse(text);
            } catch (e) {
                return { text, error: `Invalid JSON: ${e instanceof Error ? e.message : 'Unknown error'}` };
            }
        }
        
        return { text };
    } catch (error) {
        return { text: '', error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function POST(request: Request) {
    const debugLog: string[] = [];
    
    try {
        debugLog.push("=== POST Request Started ===");
        debugLog.push(`Request URL: ${request.url}`);
        debugLog.push(`Request Method: ${request.method}`);
        debugLog.push(`Content-Type: ${request.headers.get('content-type')}`);
        debugLog.push("📝 RECOMMENDED: Send empty JSON body {} with URL params (?app=Gmail&body=...text...)");
        
        const url = new URL(request.url);
        debugLog.push(`Parsed URL: ${url.toString()}`);

        // 1. Get parameters from URL
        let appName = url.searchParams.get("app");
        let bodyText = url.searchParams.get("body");
        
        debugLog.push(`URL Params - app: ${appName ? appName.substring(0, 50) : 'null'}`);
        debugLog.push(`URL Params - body: ${bodyText ? bodyText.substring(0, 100) : 'null'}`);

        // 2. If no body in URL params, try to parse request body
        if (!bodyText) {
            debugLog.push("Body text not found in URL params, attempting to parse request body");
            const { text, error } = await safeGetBody(request);
            
            if (error) {
                debugLog.push(`Body parsing info: ${error}`);
            }
            
            debugLog.push(`Raw body length: ${text.length}`);
            if (text.length > 0) {
                debugLog.push(`Raw body (first 200 chars): ${text.substring(0, 200)}`);
            }
            
            if (text && text.trim() !== '') {
                try {
                    const parsed = JSON.parse(text);
                    debugLog.push(`Parsed as JSON object`);
                    bodyText = parsed.body || parsed.message || JSON.stringify(parsed);
                    appName = appName || parsed.app || 'unknown';
                } catch {
                    // Not JSON, treat as plain text
                    debugLog.push(`Could not parse as JSON, treating as plain text`);
                    bodyText = text;
                }
            }
        }

        if (!bodyText || bodyText.trim() === '') {
            debugLog.push("Final bodyText is empty after all parsing attempts");
            return NextResponse.json({
                error: "No body content found in URL params or request body",
                debugLog,
                hint: "Send request with URL parameters: ?app=Gmail&body=your%20transaction%20text"
            }, { status: 400 });
        }

        // Sanitize text
        const sanitizedBody = bodyText
            .replace(/[\r\n]+/g, " ")
            .trim();

        debugLog.push(`App Name: ${appName || 'not provided'}`);
        debugLog.push(`Original Body Length: ${bodyText.length} chars`);
        debugLog.push(`Sanitized Body (first 100 chars): ${sanitizedBody.substring(0, 100)}`);

        // 3. Analyze with Gemini
        const model = genAI.getGenerativeModel({
            model: 'gemini-flash-lite-latest' ,
            generationConfig: { responseMimeType: "application/json" }});
        
        const categories = ["Дім", "Одяг", "Авто", "Їжа й хозяйство", "Освіта", "Паливо", "Комуналка", "Розваги", "Підписки", "Здоров'я", "Інше"];
        const currentDate = new Date().toLocaleDateString('uk-UA');

        const sanitizedText = sanitizedBody
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
            .replace(/\n/g, " ")
            .replace(/\r/g, "");

        const prompt = `
          Проаналізуй текст транзакції: "${sanitizedText}"
          Витягни дані у JSON:
          {
            "category": "одна з: ${categories.join(', ')}",
            "amount": число,
            "currency": "валюта (UAH, ALL, EUR тощо)",
            "merchant": "назва закладу чи сервісу"
          }
        `;
        
        debugLog.push("Sending request to Gemini API");
        let parsedData;

        const result = await model.generateContent(prompt);
        debugLog.push(`Gemini Response: ${result.response.text().substring(0, 200)}`);
        
        try {
            parsedData = JSON.parse(result.response.text());
            debugLog.push(`Successfully parsed Gemini response`);
        } catch (parseError) {
            debugLog.push(`Error parsing Gemini JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
            debugLog.push(`Gemini raw response: ${result.response.text()}`);
            return NextResponse.json({
                error: 'Failed to parse AI response',
                debugLog,
                geminiResponse: result.response.text()
            }, { status: 500 });
        }

        // 4. Write to Google Sheets
        debugLog.push("Attempting to write to Google Sheets");
        await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'Transactions!A:F',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[currentDate, parsedData.category, parsedData.amount, parsedData.currency, parsedData.merchant, appName]],
            },
        });
        
        debugLog.push("Successfully wrote to Google Sheets");

        return NextResponse.json({
            success: true,
            parsedData,
            debugLog,
            receivedAt: new Date().toISOString()
        });
    } catch (error) {
        debugLog.push(`FATAL ERROR: ${error instanceof Error ? error.message : String(error)}`);
        debugLog.push(`Stack: ${error instanceof Error ? error.stack?.substring(0, 500) : 'N/A'}`);
        
        console.error('Error:', error);
        return NextResponse.json({
            error: 'Server Error',
            debugLog,
            errorDetails: error instanceof Error ? {
                message: error.message,
            } : String(error)
        }, { status: 500 });
    }
}

export async function GET() {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'API ключ не знайдено в .env.local' }, { status: 500 });
        }

        // Робимо прямий запит до Google API для отримання списку всіх моделей
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();

        if (!data.models) {
            return NextResponse.json({ error: 'Не вдалося отримати список', details: data }, { status: 500 });
        }

        // Фільтруємо тільки ті моделі, які підтримують генерацію тексту (generateContent)
        const availableModels = data.models
            .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
            .map((m: any) => m.name);

        return NextResponse.json({
            count: availableModels.length,
            models: availableModels
        });

    } catch (error) {
        console.error('Помилка при отриманні моделей:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}