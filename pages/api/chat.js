const { Configuration, OpenAIApi } = require('openai');
const axios = require('axios');
const cheerio = require('cheerio');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

// Utility function to extract text from a URL
async function crawlPage(url) {
  try {
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);

    // Get all visible text
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    return text.slice(0, 5000); // Limit text to avoid token overflow
  } catch (err) {
    console.error(`Failed to crawl ${url}:`, err.message);
    return '';
  }
}

// Determine which pages to crawl based on message content
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


  // Add more if/else conditions for other communities

  return urls;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://www.nova55homes.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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

    // Add IDX link if user mentioned 55+ communities
    const mention55Plus = /55\+|55 plus|55 and over|senior community|retirement/i.test(userMessage);
    if (mention55Plus) {
      aiMessage.content += `\n\n🔍 You can also view all available 55+ community listings here: [View Listings](https://nova55homes.idxbroker.com/i/55nova)`;
    }

    console.log('OpenAI response:', aiMessage);
    res.status(200).json({ result: aiMessage });
  } catch (error) {
    console.error('Error during OpenAI call:', error.response?.data || error.message || error);
    res.status(500).json({ error: error.response?.data || error.message || 'Internal Server Error' });
  }
}
s