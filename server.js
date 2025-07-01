require('dotenv').config();

const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Endpoint para gerar pagamento Pix
app.post('/pix', async (req, res) => {
  console.log('📦 Body recebido do front:', req.body);
  try {
    const response = await fetch('https://api.realtechdev.com.br/v1/transactions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.REALTECH_API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Buckpay API'
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    console.log('✅ Resposta da RealTechDev:', response.status, data);
    res.status(response.status).json(data);
  } catch (err) {
    console.error('❌ Erro no fetch da RealTechDev:', err);
    res.status(500).json({ error: 'Erro ao conectar com a RealTechDev' });
  }
});

// ✅ Novo endpoint para receber webhooks
app.post('/webhook', async (req, res) => {
  const { event, data } = req.body;
  console.log('📩 Webhook recebido:', event, data);

  let pushcutUrl = null;

  if (event === 'transaction.created') {
    pushcutUrl = 'https://api.pushcut.io/U-9R4KGCR6y075x0NYKk7/notifications/CheckoutFy%20Gerou';
  } else if (event === 'transaction.processed') {
    pushcutUrl = 'https://api.pushcut.io/U-9R4KGCR6y075x0NYKk7/notifications/Aprovado';
  }

  if (pushcutUrl) {
    try {
      const response = await fetch(pushcutUrl, { method: 'POST' });
      console.log(`🚀 Pushcut enviado: ${pushcutUrl} - status: ${response.status}`);
    } catch (error) {
      console.error('❌ Erro ao enviar Pushcut:', error);
    }
  } else {
    console.log('⚠️ Evento não tratado:', event);
  }

  res.status(200).send('Webhook recebido');
});

app.listen(3000, () => console.log('🚀 Servidor rodando em http://localhost:3000'));
