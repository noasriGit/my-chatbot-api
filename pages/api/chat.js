const { Configuration, OpenAIApi } = require('openai');
const axios = require('axios');
const cheerio = require('cheerio');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// --- Memory-based rate limiting
const ipUsageMap = new Map(); // { ip: { count, date } }
const MAX_REQUESTS_PER_DAY = 20;

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
}

function isRateLimited(ip) {
  const today = new Date().toISOString().split('T')[0];
  const usage = ipUsageMap.get(ip);

  if (!usage || usage.date !== today) {
    ipUsageMap.set(ip, { count: 1, date: today });
    return false;
  }

  if (usage.count >= MAX_REQUESTS_PER_DAY) {
    return true;
  }

  usage.count += 1;
  ipUsageMap.set(ip, usage);
  return false;
}

// --- Crawl Utility
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

// --- Community Utilities
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

function getCommunityLink(messageContent) {
  if (/carters mill/i.test(messageContent)) {
    return 'https://www.nova55homes.com/community/carters-mill';
  }
  if (/dunbarton at braemar/i.test(messageContent)) {
    return 'https://www.nova55homes.com/community/dunbarton';
  }
  if (/four seasons at historic virginia/i.test(messageContent)) {
    return 'https://www.nova55homes.com/community/four-seasons';
  }
  if (/central parke at lowes island/i.test(messageContent)) {
    return 'https://www.nova55homes.com/community/central-parke';
  }
  return null;
}

// --- Handler
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://www.nova55homes.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).json({});
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Daily message limit reached. Try again tomorrow.' });
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
      max_tokens: 500, // cap on response size
    });

    let aiMessage = completion.data.choices[0].message;

    // Append community page link if detected
    const communityLink = getCommunityLink(userMessage);
    if (communityLink) {
      aiMessage.content += `\n\n🔗 [View Community Page](${communityLink})`;
    }

    // Always append contact info
    aiMessage.content += `\n\n📞 **Contact Our 55+ Specialist**  
**Name:** Noah Masri  
**Phone:** (703) 655-9585  
**Email:** noahmasri@remax.net  
[Schedule a Tour](https://www.nova55homes.com/contact)`;

    // Optionally add 55+ listing link if the topic is general
    const mention55Plus = /55\+|55 plus|55 and over|senior community|retirement/i.test(userMessage);
    if (mention55Plus) {
      aiMessage.content += `\n\n🏡 [Browse All 55+ Listings](https://nova55homes.idxbroker.com/i/55nova)`;
    }

    res.status(200).json({ result: aiMessage });
  } catch (error) {
    console.error('OpenAI error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
