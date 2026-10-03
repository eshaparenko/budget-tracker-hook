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
        debugLog.push(`Request URL: ${request.url}`);
        debugLog.push(`Request Method: ${request.method}`);
        debugLog.push(`Content-Type: ${request.headers.get('content-type')}`);
        
        const url = new URL(request.url);
        debugLog.push(`Parsed URL: ${url.toString()}`);

        // 1. Спочатку пробуємо забрати параметри з URL (якщо MacroDroid передає їх у вигляді ?app=...&body=...)
        let appName = url.searchParams.get("app");
        let bodyText = url.searchParams.get("body");
        
        debugLog.push(`URL Params - app: ${appName ? appName.substring(0, 50) : 'null'}`);
        debugLog.push(`URL Params - body: ${bodyText ? bodyText.substring(0, 100) : 'null'}`);

        // 2. Якщо в URL параметрів немає, перевіряємо тіло запиту (Body)
        if (!bodyText) {
            debugLog.push("Body text not found in URL params, attempting to parse request body");
            try {
                const contentType = request.headers.get('content-type') || '';
                
                if (contentType.includes('application/json')) {
                    debugLog.push("Content-Type is JSON, parsing JSON body");
                    const jsonBody = await request.json();
                    debugLog.push(`JSON Body parsed: ${JSON.stringify(jsonBody).substring(0, 100)}`);
                    bodyText = jsonBody.body || jsonBody.message || JSON.stringify(jsonBody);
                    appName = appName || jsonBody.app || 'unknown';
                } else if (contentType.includes('application/x-www-form-urlencoded')) {
                    debugLog.push("Content-Type is form-urlencoded, parsing form data");
                    const text = await request.text();
                    debugLog.push(`Raw body: ${text.substring(0, 100)}`);
                    const params = new URLSearchParams(text);
                    bodyText = params.get('body') || params.get('message') || text;
                    appName = appName || params.get('app') || 'unknown';
                } else if (contentType.includes('text/plain')) {
                    debugLog.push("Content-Type is text/plain, reading as text");
                    bodyText = await request.text();
                    debugLog.push(`Text body: ${bodyText.substring(0, 100)}`);
                } else {
                    debugLog.push(`Unknown content-type: ${contentType}, attempting text parsing`);
                    bodyText = await request.text();
                }
            } catch (parseBodyError) {
                debugLog.push(`Error parsing request body: ${parseBodyError instanceof Error ? parseBodyError.message : String(parseBodyError)}`);
                return NextResponse.json({
                    error: "Failed to parse request body",
                    debugLog,
                    details: parseBodyError instanceof Error ? parseBodyError.message : String(parseBodyError)
                }, { status: 400 });
            }
        }

        if (!bodyText || bodyText.trim() === '') {
            debugLog.push("Final bodyText is empty after all parsing attempts");
            return NextResponse.json({
                error: "No body content found",
                debugLog
            }, { status: 400 });
        }

        // Очищаємо текст від переносів рядків та зайвих символів для Gemini
        const sanitizedBody = bodyText
            .replace(/[\r\n]+/g, " ")
            .trim();

        debugLog.push(`App Name: ${appName}`);
        debugLog.push(`Original Body Length: ${bodyText.length} chars`);
        debugLog.push(`Sanitized Body (first 100 chars): ${sanitizedBody.substring(0, 100)}`);

        // 2. Аналіз через Gemini
        const model = genAI.getGenerativeModel({
            model: 'gemini-flash-lite-latest' ,
            generationConfig: { responseMimeType: "application/json" }});
        
        // Категорії підлаштовані під ваш звичний флоу
        const categories = ["Дім", "Одяг", "Авто", "Їжа й хозяйство", "Освіта", "Паливо", "Комуналка", "Розваги", "Підписки", "Здоров'я", "Інше"];
        // Отримуємо поточну дату у форматі DD.MM.YYYY
        const currentDate = new Date().toLocaleDateString('uk-UA');

        // Очищаємо текст від керуючих символів, які ламають JSON (переноси рядків, табуляція тощо)
        const sanitizedText = sanitizedBody
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // видаляємо невидимі управляючі символи
            .replace(/\n/g, " ")                           // переноси рядків замінюємо на пробіл
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
            debugLog.push(`Successfully parsed Gemini response: ${JSON.stringify(parsedData)}`);
        } catch (parseError) {
            debugLog.push(`Error parsing Gemini JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
            debugLog.push(`Gemini raw response: ${result.response.text()}`);
            return NextResponse.json({
                error: 'Failed to parse AI response',
                debugLog,
                geminiResponse: result.response.text()
            }, { status: 500 });
        }

        // 3. Запис у Google Sheets
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
        debugLog.push(`Stack: ${error instanceof Error ? error.stack : 'N/A'}`);
        
        console.error('Error:', error);
        return NextResponse.json({
            error: 'Server Error',
            debugLog,
            errorDetails: error instanceof Error ? {
                message: error.message,
                stack: error.stack
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