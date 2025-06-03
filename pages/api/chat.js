const { Configuration, OpenAIApi } = require('openai');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://www.nova55homes.com/');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }

  try {
    console.log('Sending to OpenAI:', messages);

    const completion = await openai.createChatCompletion({
      model: 'gpt-4o',
      messages,
    });

    let aiMessage = completion.data.choices[0].message;

    // Check if user asked about 55+ communities
    const lastUserMessage = messages[messages.length - 1]?.content || '';
    const mention55Plus = /55\+|55 plus|55 and over|senior community|retirement/i.test(lastUserMessage);

    if (mention55Plus) {
      // Append IDX link to the end of the assistant's message
      aiMessage.content += `\n\n🔍 You can also view all available 55+ community listings here: [View Listings](https://nova55homes.idxbroker.com/i/55nova)`;
    }

    console.log('OpenAI response:', aiMessage);

    res.status(200).json({ result: aiMessage });
  } catch (error) {
    console.error('Error during OpenAI call:', error.response?.data || error.message || error);
    res.status(500).json({ error: error.response?.data || error.message || 'Internal Server Error' });
  }
}
