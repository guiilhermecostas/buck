require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const axios = require('axios');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const API_PIX = 'https://api.realtechdev.com.br/v1/transactions';
const API_TOKEN = process.env.REALTECH_TOKEN;

// 🔁 Função para limpar tracking
function limparTracking(tracking) {
  return {
    ref: tracking?.ref || null,
    src: tracking?.src || null,
    sck: tracking?.sck || null,
    utm: {
      source: tracking?.utm?.source || null,
      medium: tracking?.utm?.medium || null,
      campaign: tracking?.utm?.campaign || null,
      id: tracking?.utm?.id || null,
      term: tracking?.utm?.term || null,
      content: tracking?.utm?.content || null
    }
  };
}

// ✅ ROTA PARA CRIAR PIX
app.post('/pix', async (req, res) => {
  try {
    const body = req.body;
    console.log('📦 Body recebido do front:', body);

    const trackingLimpo = limparTracking(body.tracking);

    const response = await axios.post(API_PIX, {
      external_id: body.external_id,
      payment_method: body.payment_method,
      amount: body.amount,
      buyer: body.buyer,
    }, {
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
      }
    });

    const result = response.data;
    console.log('✅ Resposta da RealTechDev:', result);

    // 🧠 Salvar no Supabase com transaction_id
    await supabase.from('trackings').upsert({
      external_id: body.external_id,
      transaction_id: result.data.id,
      tracking: trackingLimpo
    });

    return res.json(result);
  } catch (err) {
    console.error('❌ Erro ao criar Pix:', err.response?.data || err.message);
    return res.status(500).json({ error: 'Erro ao gerar Pix' });
  }
});

// ✅ ROTA PARA WEBHOOK
app.post('/webhook', async (req, res) => {
  try {
    const { event, data } = req.body;
    console.log('📩 Webhook recebido:', req.body);

    const transaction_id = data.id;
    console.log('🔍 Transaction ID recebido no webhook:', transaction_id);

    // 🔎 Buscar no Supabase pelo transaction_id
    const { data: trackingData } = await supabase
      .from('trackings')
      .select('tracking')
      .eq('transaction_id', transaction_id)
      .single();

    if (!trackingData) {
      console.warn('⚠️ Não encontrou tracking para transaction_id no banco');
    }

    // 🔄 Enviar eventos para UTMify ou outro lugar (exemplo)
    if (trackingData?.tracking) {
      const tracking = trackingData.tracking;

      // 🔗 Envio para UTMify (se quiser)
      await axios.post('https://app.utmify.com.br/tracking/v1/events', {
        event: 'waiting_payment',
        transaction_id: transaction_id,
        tracking
      });
      console.log('✅ Evento waiting_payment enviado à UTMify');
    }

    // ✅ Enviar para Pixel do Facebook (exemplo)
    await axios.post(`https://graph.facebook.com/v17.0/${process.env.FB_PIXEL_ID}/events`, {
      event_name: 'InitiateCheckout',
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_source_url: 'https://ajudeana.com.br/',
      user_data: {},
      custom_data: {
        currency: 'BRL',
        value: data.total_amount / 100,
      }
    }, {
      params: {
        access_token: process.env.FB_ACCESS_TOKEN
      }
    });
    console.log('✅ Evento Facebook InitiateCheckout enviado');

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('❌ Erro no webhook:', err.message);
    res.status(500).json({ error: 'Erro interno no webhook' });
  }
});

// ✅ Iniciar servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
 