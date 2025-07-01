require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const axios = require('axios');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const app = express();
app.use(cors());
app.use(express.json());

// 🔧 Função para garantir valores padrão no tracking
function limparTracking(tracking) {
  const utm = tracking?.utm || {};
  return {
    ref: tracking?.ref || 'default_ref',
    src: tracking?.src || 'default_src',
    sck: tracking?.sck || 'default_sck',
    utm: {
      source: utm.source || 'default_source',
      medium: utm.medium || 'default_medium',
      campaign: utm.campaign || 'default_campaign',
      term: utm.term || 'default_term',
      content: utm.content || 'default_content'
    }
  };
}

// Endpoint para gerar pagamento Pix
app.post('/pix', async (req, res) => { 
  console.log('📦 Body recebido do front:', req.body);

  try {
    const { external_id, payment_method, amount, buyer, tracking } = req.body;

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

    // Salvar tracking + transaction_id no Supabase
    if (external_id && tracking && data?.id) {
      const trackingLimpo = limparTracking(tracking);

      const { error } = await supabase.from('trackings').upsert({
        external_id,
        transaction_id: data.id,
        tracking: trackingLimpo
      });

      if (error) console.error('❌ Erro ao salvar tracking no Supabase:', error);
      else console.log(`💾 Tracking salvo no Supabase para external_id ${external_id}`);
    }

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

  console.log('🔍 External ID recebido no webhook:', data.external_id);

  let trackingFromDb = null;

  if (data.external_id) {
    const { data: trackingRow, error } = await supabase
      .from('trackings')
      .select('tracking')
      .eq('external_id', data.external_id)
      .single();

    if (!error && trackingRow) {
      trackingFromDb = trackingRow.tracking;
    }
  }

  if (!trackingFromDb && data.id) {
    const { data: trackingRowById, error: errorById } = await supabase
      .from('trackings')
      .select('tracking')
      .eq('transaction_id', data.id)
      .single();

    if (!errorById && trackingRowById) {
      trackingFromDb = trackingRowById.tracking;
      console.log(`🔁 Tracking carregado por ID da transação:`, trackingFromDb);
    }
  }

  if (trackingFromDb) {
    data.tracking = trackingFromDb;
    console.log('✅ Tracking restaurado para o webhook');
  } else {
    console.warn('⚠️ Nenhum tracking encontrado para o webhook');
  }

  const valor = data.total_amount || 0;

  if (event === 'transaction.created' && data.status === 'pending') {
    await sendPushcutNotification(
      'https://api.pushcut.io/U-9R4KGCR6y075x0NYKk7/notifications/CheckoutFy%20Gerou',
      'Pagamento criado',
      `ID: ${data.id} | Valor: R$ ${(valor / 100).toFixed(2)}`
    );
    await enviarEventoUtmify(data, 'waiting_payment');
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
    const utm = data.tracking?.utm || {};

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
        utm_term: utm.term || '',
        utm_medium: utm.medium || '',
        utm_source: utm.source || '',
        utm_content: utm.content || '',
        utm_campaign: utm.campaign || ''
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
