require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const TRACKING_FILE = path.join(__dirname, 'tracking.json');

// Carregar tracking salvo
let trackingStorage = {};
try {
  if (fs.existsSync(TRACKING_FILE)) {
    const rawData = fs.readFileSync(TRACKING_FILE);
    trackingStorage = JSON.parse(rawData);
    console.log(`📂 Tracking carregado de ${TRACKING_FILE}`);
  }
} catch (err) {
  console.error('❌ Erro ao ler tracking.json:', err);
}

// Salvar tracking em arquivo
function salvarTracking(external_id, tracking) {
  trackingStorage[external_id] = tracking;
  fs.writeFile(TRACKING_FILE, JSON.stringify(trackingStorage, null, 2), (err) => {
    if (err) {
      console.error('❌ Erro ao salvar tracking:', err);
    } else {
      console.log(`💾 Tracking salvo para external_id ${external_id}`);
    }
  });
}

// Endpoint para gerar pagamento Pix
app.post('/pix', async (req, res) => {
  console.log('📦 Body recebido do front:', req.body);

  try {
    const { external_id, payment_method, amount, buyer, tracking } = req.body;

    if (external_id && tracking) salvarTracking(external_id, tracking);

    const payloadRealTech = {
      external_id,
      payment_method,
      amount,
      buyer
    };

    const response = await fetch('https://api.realtechdev.com.br/v1/transactions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.REALTECH_API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Buckpay API'
      },
      body: JSON.stringify(payloadRealTech)
    });

    const data = await response.json();
    console.log('✅ Resposta da RealTechDev:', response.status, data);
    res.status(response.status).json(data);
  } catch (err) {
    console.error('❌ Erro no fetch da RealTechDev:', err);
    res.status(500).json({ error: 'Erro ao conectar com a RealTechDev' });
  }
});

// Webhook
app.post('/webhook', async (req, res) => {
  console.log('📩 Webhook recebido:', JSON.stringify(req.body, null, 2));

  const { event, data } = req.body;
  if (!data) return res.status(400).send('Payload inválido');

  const trackingFromFile = data.external_id ? trackingStorage[data.external_id] : null;
  if (trackingFromFile) {
    data.tracking = trackingFromFile;
    console.log(`🔍 Tracking recuperado de arquivo para external_id ${data.external_id}:`, trackingFromFile);
  } else {
    console.log('⚠️ Tracking não encontrado no arquivo, usando o que veio (provavelmente null)');
  }

  const valor = data.total_amount || 0;

  if (event === 'transaction.created' && data.status === 'pending') {
    await sendPushcutNotification(
      'https://api.pushcut.io/U-9R4KGCR6y075x0NYKk7/notifications/CheckoutFy%20Gerou',
      'Pagamento criado',
      `ID: ${data.id} | Valor: R$ ${(valor / 100).toFixed(2)}`
    );
    await enviarEventoUtmify(data, 'paid');
  }

  if (event === 'transaction.processed' && data.status === 'paid') {
    await sendPushcutNotification(
      'https://api.pushcut.io/U-9R4KGCR6y075x0NYKk7/notifications/Aprovado',
      'Pagamento aprovado',
      `ID: ${data.id} | Valor: R$ ${(valor / 100).toFixed(2)}`
    );
    await enviarEventoUtmify(data, 'paid');
  }

  res.status(200).send('Webhook recebido');
});

// Pushcut
async function sendPushcutNotification(url, title, text) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, text })
    });
    const txt = await response.text();
    console.log(`🚀 Pushcut: ${response.status} - ${txt}`);
  } catch (err) {
    console.error('❌ Erro no Pushcut:', err);
  }
}

// UTMify
async function enviarEventoUtmify(data, status) {
  try {
    const payload = {
      orderId: data.id,
      platform: "checkoutfy",
      paymentMethod: data.payment_method || 'pix',
      status: status,
      createdAt: new Date(data.created_at || Date.now()).toISOString(),
      approvedDate: new Date().toISOString(),
      customer: {
        name: data.buyer?.name || 'Sem nome',
        email: data.buyer?.email || 'sememail@email.com',
        phone: data.buyer?.phone || '',
        document: data.buyer?.document || ''
      },
      trackingParameters: {
        utm_campaign: data.tracking?.utm?.campaign || '',
        utm_content: data.tracking?.utm?.content || '',
        utm_medium: data.tracking?.utm?.medium || '',
        utm_source: data.tracking?.utm?.source || '',
        utm_term: data.tracking?.utm?.term || ''
      },
      commission: {
        totalPriceInCents: data.total_amount || 0,
        gatewayFeeInCents: 300,
        userCommissionInCents: data.total_amount || 0
      },
      products: [
        {
          id: "produto1",
          name: data.offer?.name || 'Produto',
          planId: "plano123",
          planName: "Plano VIP",
          quantity: data.offer?.quantity || 1,
          priceInCents: data.total_amount || 0
        }
      ]
    };

    const response = await axios.post("https://api.utmify.com.br/api-credentials/orders", payload, {
      headers: {
        "Content-Type": "application/json",
        "x-api-token": process.env.UTMIFY_API_KEY
      }
    });

    console.log(`✅ Evento ${status} enviado à UTMify:`, response.status);
  } catch (error) {
    console.error(`❌ Erro ao enviar evento ${status} para UTMify:`, error.message);
  }
}

app.listen(3000, () => console.log('🚀 Servidor rodando em http://localhost:3000'));
