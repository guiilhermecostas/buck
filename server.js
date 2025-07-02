require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const axios = require('axios');
const cors = require('cors');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const FB_PIXEL_ID = process.env.FB_PIXEL_ID;
const FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;

const app = express();
app.use(cors());
app.use(express.json());

function limparTracking(tracking) {
  const safe = (val, def) => (val && val !== 'null') ? val : def;
  const utm = tracking?.utm || {};

  return {
    ref: safe(tracking?.ref, 'default_ref'),
    src: safe(tracking?.src, 'default_src'),
    sck: safe(tracking?.sck, 'default_sck'),
    utm: {
      source: safe(utm.source, 'default_source'),
      medium: safe(utm.medium, 'default_medium'),
      campaign: safe(utm.campaign, 'default_campaign'),
      term: safe(utm.term, 'default_term'),
      content: safe(utm.content, 'default_content')
    }
  };
}

function hashSHA256(str) {
  return crypto.createHash('sha256').update(str.trim().toLowerCase()).digest('hex');
}

async function enviarEventoFacebook(eventName, data) {
  if (!FB_PIXEL_ID || !FB_ACCESS_TOKEN) {
    console.warn('⚠️ Facebook Pixel ID ou Access Token não configurados.');
    return;
  }

  const url = `https://graph.facebook.com/v17.0/${FB_PIXEL_ID}/events?access_token=${FB_ACCESS_TOKEN}`;
  const eventData = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_id: data.id,
      user_data: {
        em: data.buyer?.email ? hashSHA256(data.buyer.email) : undefined
      },
      custom_data: {
        currency: 'BRL',
        value: (data.total_amount || 0) / 100
      }
    }]
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(eventData),
      headers: { 'Content-Type': 'application/json' }
    });
    const json = await response.json();
    console.log(`✅ Evento Facebook ${eventName} enviado:`, json);
  } catch (error) {
    console.error(`❌ Erro ao enviar evento Facebook ${eventName}:`, error);
  }
}

app.post('/pix', async (req, res) => {
  console.log('📦 Body recebido do front:', req.body);
  try {
    const { external_id, payment_method, amount, buyer, tracking } = req.body;

    const payloadRealTech = { external_id, payment_method, amount, buyer };
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

    return res.status(response.status).json({
      data: {
        pix: {
          code: data.code || data.pix?.code,
          qrcode_base64: data.qrcode_base64 || data.pix?.qrcode_base64
        }
      }
    });
  } catch (err) {
    console.error('❌ Erro no fetch da RealTechDev:', err);
    res.status(500).json({ error: 'Erro ao conectar com a RealTechDev' });
  }
});

app.post('/webhook', async (req, res) => {
  console.log('📩 Webhook recebido:', JSON.stringify(req.body, null, 2));
  const { event, data } = req.body;
  if (!data) return res.status(400).send('Payload inválido');

  console.log('🔍 External ID recebido no webhook:', data.external_id);

  let trackingFromDb = null;

  if (data.external_id) {
    const { data: trackingRow } = await supabase
      .from('trackings')
      .select('tracking')
      .eq('external_id', data.external_id)
      .single();
    if (trackingRow) trackingFromDb = trackingRow.tracking;
  }

  if (!trackingFromDb && data.id) {
    const { data: trackingRowById } = await supabase
      .from('trackings')
      .select('tracking')
      .eq('transaction_id', data.id)
      .single();
    if (trackingRowById) {
      trackingFromDb = trackingRowById.tracking;
      console.log('🔁 Tracking carregado por ID da transação:', trackingFromDb);
    }
  }

  if (trackingFromDb) {
    data.tracking = trackingFromDb;
    console.log('✅ Tracking restaurado para o webhook');
  } else {
    console.warn('⚠️ Nenhum tracking encontrado para o webhook — usando valores padrão');
    data.tracking = limparTracking(null);
  }

  const valor = data.total_amount || 0;

  if (event === 'transaction.created' && data.status === 'pending') {
    await enviarEventoUtmify(data, 'waiting_payment');
    await enviarEventoFacebook('InitiateCheckout', data);
  }

  if (event === 'transaction.processed' && data.status === 'paid') {
    await enviarEventoUtmify(data, 'paid');
    await enviarEventoFacebook('Purchase', data);
  }

  res.status(200).send('Webhook recebido');
});

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
      products: [{
        id: "produto1",
        name: data.offer?.name || 'Produto',
        planId: "plano123",
        planName: "Plano VIP",
        quantity: data.offer?.quantity || 1,
        priceInCents: data.total_amount || 0
      }]
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
