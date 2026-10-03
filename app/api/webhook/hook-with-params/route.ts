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

export async function POST(request: Request) {
    const debugLog: string[] = [];
    
    try {
        debugLog.push("=== POST Request Started ===");
        debugLog.push(`URL: ${request.url}`);
        debugLog.push(`Content-Type: ${request.headers.get('content-type') || 'not set'}`);
        
        const url = new URL(request.url);
        debugLog.push(`Full URL: ${url.toString()}`);
        debugLog.push(`Search params: ${url.search}`);

        // 1. Extract URL parameters
        const app = url.searchParams.get("app") || "Gmail";
        const bodyParam = url.searchParams.get("body");
        
        debugLog.push(`URL param 'app': ${app}`);
        debugLog.push(`URL param 'body': ${bodyParam ? `"${bodyParam.substring(0, 50)}..."` : '(empty)'}`);

        // 2. Use URL body parameter - it's always the source of truth
        let bodyText = bodyParam;
        
        // 3. Only check request body if URL param is missing
        if (!bodyText || bodyText.trim() === '') {
            debugLog.push("No 'body' URL param, checking request body...");
            try {
                const contentType = request.headers.get('content-type') || '';
                const rawBody = await request.text();
                debugLog.push(`Request body length: ${rawBody.length}`);
                
                if (rawBody && rawBody.trim() && rawBody.trim() !== '{}' && rawBody.trim() !== '[]') {
                    debugLog.push(`Request body content: ${rawBody.substring(0, 100)}`);
                    try {
                        const json = JSON.parse(rawBody);
                        bodyText = json.body || json.message || json.text || JSON.stringify(json);
                        debugLog.push(`Extracted from JSON: ${bodyText.substring(0, 50)}`);
                    } catch {
                        bodyText = rawBody;
                        debugLog.push(`Parsed as plain text`);
                    }
                } else {
                    debugLog.push(`Request body is empty or just {}`);
                }
            } catch (e) {
                debugLog.push(`Error reading body: ${e instanceof Error ? e.message : 'unknown'}`);
            }
        }

        // 4. Final validation
        if (!bodyText || bodyText.trim() === '') {
            debugLog.push("❌ ERROR: No body content available");
            return NextResponse.json({
                error: "No body content",
                debugLog,
                usage: "POST /api/webhook/hook-with-params?app=Gmail&body=your%20text%20here"
            }, { status: 400 });
        }

        debugLog.push(`✓ Body received: ${bodyText.length} chars`);
        debugLog.push(`✓ App: ${app}`);

        // 5. Sanitize for Gemini
        const sanitized = bodyText
            .replace(/[\r\n]+/g, " ")
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
            .trim();

        // 6. Call Gemini
        const model = genAI.getGenerativeModel({
            model: 'gemini-flash-lite-latest',
            generationConfig: { responseMimeType: "application/json" }
        });

        const categories = ["Дім", "Одяг", "Авто", "Їжа й хозяйство", "Освіта", "Паливо", "Комуналка", "Розваги", "Підписки", "Здоров'я", "Інше"];
        
        const prompt = `Проаналізуй текст транзакції: "${sanitized}"
Витягни дані у JSON:
{
  "category": "одна з: ${categories.join(', ')}",
  "amount": число,
  "currency": "валюта (UAH, USD, EUR тощо)",
  "merchant": "назва закладу чи сервісу"
}`;

        debugLog.push("→ Calling Gemini...");
        const result = await model.generateContent(prompt);
        const geminiText = result.response.text();
        debugLog.push(`← Gemini response: ${geminiText.substring(0, 100)}`);

        let parsedData;
        try {
            parsedData = JSON.parse(geminiText);
            debugLog.push(`✓ Parsed Gemini JSON`);
        } catch (e) {
            debugLog.push(`❌ Failed to parse Gemini response: ${e instanceof Error ? e.message : 'unknown'}`);
            return NextResponse.json({
                error: "Gemini response parsing failed",
                debugLog,
                geminiRaw: geminiText
            }, { status: 500 });
        }

        // 7. Write to Sheets
        const currentDate = new Date().toLocaleDateString('uk-UA');
        debugLog.push("→ Writing to Google Sheets...");
        
        await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'Transactions!A:F',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[currentDate, parsedData.category, parsedData.amount, parsedData.currency, parsedData.merchant, app]],
            },
        });
        
        debugLog.push("✓ Wrote to Google Sheets");

        return NextResponse.json({
            success: true,
            parsedData,
            debugLog
        });

    } catch (error) {
        debugLog.push(`❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
        console.error('Webhook error:', error);
        
        return NextResponse.json({
            error: 'Server error',
            debugLog
        }, { status: 500 });
    }
}

export async function GET() {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'API key missing' }, { status: 500 });
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();

        if (!data.models) {
            return NextResponse.json({ error: 'Failed to fetch models', details: data }, { status: 500 });
        }

        const availableModels = data.models
            .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
            .map((m: any) => m.name);

        return NextResponse.json({
            count: availableModels.length,
            models: availableModels
        });

    } catch (error) {
        console.error('Error fetching models:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
