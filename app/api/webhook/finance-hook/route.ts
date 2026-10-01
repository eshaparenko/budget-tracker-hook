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
    try {
        const rawText = await request.text();

        let parsedData;
        try {
            parsedData = JSON.parse(rawText);
        } catch (err: any) {
            console.error("--- JSON PARSE ERROR ---");
            console.error("Error message:", err.message);
            console.error("Raw text received:", JSON.stringify(rawText));

            return NextResponse.json({
                error: "Invalid JSON format",
                details: err.message,
                receivedText: rawText
            }, {status: 400});
        }

        const appName = parsedData.app || "Unknown";
        const bodyText = parsedData.body || rawText;

        if (!bodyText) {
            return NextResponse.json({error: "No body provided"}, {status: 400});
        }
        // 2. Аналіз через Gemini
        const model = genAI.getGenerativeModel({
            model: 'gemini-flash-lite-latest' ,
            generationConfig: { responseMimeType: "application/json" }});
        // Категорії підлаштовані під ваш звичний флоу
        const categories = ["Дім", "Одяг", "Авто", "Їжа й хозяйство", "Освіта", "Паливо", "Комуналка", "Розваги", "Підписки", "Здоров'я", "Інше"];
        // Отримуємо поточну дату у форматі DD.MM.YYYY
        const currentDate = new Date().toLocaleDateString('uk-UA');

        // 2. Очищаємо текст від керуючих символів, які ламають JSON (переноси рядків, табуляція тощо)
        const sanitizedText = bodyText
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

        const result = await model.generateContent(prompt);
        try {
            parsedData = JSON.parse(result.response.text());
        } catch (parseError) {
            console.error("Помилка парсингу відповіді Gemini:", result.response.text());
            return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
        }

        // 3. Запис у Google Sheets
        await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'Transactions!A:F',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[currentDate, parsedData.category, parsedData.amount, parsedData.currency, parsedData.merchant, appName]],
            },
        });

        return NextResponse.json({ success: true, parsedData });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Server Error' }, { status: 500 });
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