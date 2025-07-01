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

// Endpoint para receber webhooks e disparar Pushcut
app.post('/webhook', async (req, res) => {
  console.log('📩 Webhook recebido:', JSON.stringify(req.body, null, 2));

  const { event, data } = req.body;

  // Verificação dupla: tipo de evento + status
  if (event === 'transaction.created' && data.status === 'pending') {
    // Pagamento gerado
    await sendPushcutNotification(
      'https://api.pushcut.io/U-9R4KGCR6y075x0NYKk7/notifications/CheckoutFy%20Gerou',
      'Pagamento criado',
      `ID: ${data.id} | Valor: R$ ${(data.total_amount / 100).toFixed(2)}`
    );
  }

  if (event === 'transaction.processed' && data.status === 'paid') {
    // Pagamento concluído
    await sendPushcutNotification(
      'https://api.pushcut.io/U-9R4KGCR6y075x0NYKk7/notifications/Aprovado',
      'Pagamento aprovado',
      `ID: ${data.id} | Valor: R$ ${(data.total_amount / 100).toFixed(2)}`
    );
  }

  res.status(200).send('Webhook recebido');
});

// Função reutilizável para disparar Pushcut
async function sendPushcutNotification(url, title, text) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title, text })
    });

    const responseText = await response.text();
    console.log(`🚀 Pushcut enviado para ${url}`);
    console.log(`📤 Status: ${response.status} - Resposta: ${responseText}`);
  } catch (error) {
    console.error('❌ Erro ao enviar Pushcut:', error);
  }
}

app.listen(3000, () => console.log('🚀 Servidor rodando em http://localhost:3000'));
