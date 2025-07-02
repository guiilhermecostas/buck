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

// Função para garantir valores padrão no tracking
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
      id: utm.id || null,
      term: utm.term || 'default_term',
      content: utm.content || 'default_content'
    }
  };
}

// Hash SHA256 para e-mail (recomendado pelo Facebook)
function hashSHA256(str) {
  return crypto.createHash('sha256').update(str.trim().toLowerCase()).digest('hex');
}

// Envia evento para Facebook Conversion API
async function enviarEventoFacebook(eventName, data) {
  if (!FB_PIXEL_ID || !FB_ACCESS_TOKEN) {
    console.warn('⚠️ Facebook Pixel ID ou Access Token não configurados.');
    return;
  }

  const url = `https://graph.facebook.com/v17.0/${FB_PIXEL_ID}/events?access_token=${FB_ACCESS_TOKEN}`;

  const eventData = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_id: data.id,
        user_data: {
          em: data.buyer?.email ? hashSHA256(data.buyer.email) : undefined,
        },
        custom_data: {
          currency: 'BRL',
          value: (data.total_amount || 0) / 100
        }
      }
    ],
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

// Pushcut notification
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

// Enviar evento para UTMify (usando tracking limpo)
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
        utm_term: utm.term || 'ass',
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

    if (external_id && data?.data?.id) {
      const trackingLimpo = limparTracking(tracking || {});

      const supabasePayload = {
        external_id,
        transaction_id: data.data.id,
        ref: trackingLimpo.ref,
        src: trackingLimpo.src,
        sck: trackingLimpo.sck,
        utm_source: trackingLimpo.utm.source,
        utm_campaign: trackingLimpo.utm.campaign,
        utm_term: trackingLimpo.utm.term,
        utm_content: trackingLimpo.utm.content,
        utm_id: trackingLimpo.utm.id,
        buyer_name: buyer?.name || null,
        buyer_email: buyer?.email || null,
        tracking: trackingLimpo
      };

      const { error: supabaseError, data: savedData } = await supabase
        .from('trackings')
        .upsert(supabasePayload, { onConflict: 'external_id' });

      if (supabaseError) {
        console.error('❌ Erro ao salvar tracking no Supabase:', supabaseError);
      } else {
        console.log(`💾 Tracking salvo no Supabase para external_id ${external_id}`, savedData);
      }
    } else {
      console.warn('⚠️ external_id ou transaction_id ausentes, tracking não salvo no Supabase');
    }

    res.status(response.status).json(data);
  } catch (err) {
    console.error('❌ Erro no fetch da RealTechDev:', err);
    res.status(500).json({ error: 'Erro ao conectar com a RealTechDev' });
  }
});

// Webhook atualizado com busca pelo external_id ou transaction_id e limpeza do tracking
app.post('/webhook', async (req, res) => {
  console.log('📩 Webhook recebido:', JSON.stringify(req.body, null, 2));

  const { event, data } = req.body;
  if (!data) return res.status(400).send('Payload inválido');

  console.log('🔍 External ID recebido no webhook:', data.external_id);
  console.log('🔍 Transaction ID recebido no webhook:', data.id);

  let trackingFromDb = null;

  if (data.external_id) {
    const { data: trackingRow, error } = await supabase
      .from('trackings')
      .select('*')
      .eq('external_id', data.external_id)
      .single();

    if (!error && trackingRow) {
      trackingFromDb = trackingRow.tracking;
      console.log('✅ Tracking encontrado via external_id:', trackingFromDb);
    }
  }

  if (!trackingFromDb && data.id) {
    const { data: trackingRowById, error: errorById } = await supabase
      .from('trackings')
      .select('*')
      .eq('transaction_id', data.id)
      .single();

    if (!errorById && trackingRowById) {
      trackingFromDb = trackingRowById.tracking;
      console.log('✅ Tracking encontrado via transaction_id:', trackingFromDb);
    } else {
      console.warn('⚠️ Não encontrou tracking para transaction_id no banco');
    }
  }

  // Limpa o tracking para garantir defaults
  const trackingSanitizado = limparTracking(trackingFromDb || {});

  // Atualiza o data com tracking limpo para uso nos eventos externos
  data.tracking = trackingSanitizado;

  // Atualiza registro no Supabase para manter tracking atualizado (opcional)
  if (data.id) {
    const supabasePayload = {
      transaction_id: data.id,
      ref: trackingSanitizado.ref,
      src: trackingSanitizado.src,
      sck: trackingSanitizado.sck,
      utm_source: trackingSanitizado.utm.source,
      utm_campaign: trackingSanitizado.utm.campaign,
      utm_term: trackingSanitizado.utm.term,
      utm_content: trackingSanitizado.utm.content,
      utm_id: trackingSanitizado.utm.id,
      buyer_name: data.buyer?.name || null,
      buyer_email: data.buyer?.email || null,
      tracking: trackingSanitizado
    };

    // Só atualiza external_id se existir para não apagar registro existente
    if (data.external_id) {
      supabasePayload.external_id = data.external_id;
    }

    const { error: supabaseError } = await supabase
      .from('trackings')
      .upsert(supabasePayload, { onConflict: 'external_id' });

    if (supabaseError) {
      console.error('❌ Erro ao atualizar tracking no webhook:', supabaseError);
    } else {
      console.log('💾 Tracking atualizado no webhook');
    }
  }

  const valor = data.total_amount || 0;

  if (event === 'transaction.created' && data.status === 'pending') {
    await sendPushcutNotification(
      'https://api.pushcut.io/U-9R4KGCR6y075x0NYKk7/notifications/CheckoutFy%20Gerou',
      'Pagamento criado',
      `ID: ${data.id} | Valor: R$ ${(valor / 100).toFixed(2)}`
    );
    await enviarEventoUtmify(data, 'waiting-payment');
    await enviarEventoFacebook('InitiateCheckout', data);
  } 

  if (event === 'transaction.processed' && data.status === 'paid') {
    await sendPushcutNotification(
      'https://api.pushcut.io/U-9R4KGCR6y075x0NYKk7/notifications/Aprovado',
      'Pagamento aprovado',
      `ID: ${data.id} | Valor: R$ ${(valor / 100).toFixed(2)}`
    );
    await enviarEventoUtmify(data, 'paid');
    await enviarEventoFacebook('Purchase', data);
  }

  res.status(200).send('Webhook recebido');
});

app.listen(3000, () => console.log('🚀 Servidor rodando em http://localhost:3000'));
