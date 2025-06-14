const { Configuration, OpenAIApi } = require('openai');
const axios = require('axios');
const cheerio = require('cheerio');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

async function crawlPage(url) {
  try {
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    return text.slice(0, 5000);
  } catch (err) {
    console.error(`Failed to crawl ${url}:`, err.message);
    return '';
  }
}

function getPagesToCrawl(messageContent) {
  const urls = [];

  if (/carters mill/i.test(messageContent)) {
    urls.push('https://www.nova55homes.com/community/carters-mill');
  }
  if (/dunbarton at braemar/i.test(messageContent)) {
    urls.push('https://www.nova55homes.com/community/dunbarton');
  }
  if (/four seasons at historic virginia/i.test(messageContent)) {
    urls.push('https://www.nova55homes.com/community/four-seasons');
  }
  if (/central parke at lowes island/i.test(messageContent)) {
    urls.push('https://www.nova55homes.com/community/central-parke');
  }

  return urls;
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://www.nova55homes.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight (OPTIONS) request
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }

  try {
    const userMessage = messages[messages.length - 1]?.content || '';
    const urlsToCrawl = getPagesToCrawl(userMessage);

    let crawledContent = '';
    for (const url of urlsToCrawl) {
      const pageText = await crawlPage(url);
      crawledContent += `Content from ${url}:\n${pageText}\n\n`;
    }

    const updatedMessages = [
      ...messages,
      ...(crawledContent
        ? [{ role: 'system', content: `Use this page content to answer if relevant:\n${crawledContent}` }]
        : [])
    ];

    const completion = await openai.createChatCompletion({
      model: 'gpt-4o',
      messages: updatedMessages,
    });

    let aiMessage = completion.data.choices[0].message;

    const mention55Plus = /55\+|55 plus|55 and over|senior community|retirement/i.test(userMessage);
    if (mention55Plus) {
      aiMessage.content += `\n\n🔍 You can also view all available 55+ community listings here: [View Listings](https://nova55homes.idxbroker.com/i/55nova)`;
    }

    res.status(200).json({ result: aiMessage });
  } catch (error) {
    console.error('OpenAI error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
