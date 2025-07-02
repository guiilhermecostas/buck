require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const axios = require('axios');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// UTMify
const UTMIFY_API = 'https://utmify.io/api/event';
const UTMIFY_KEY = process.env.UTMIFY_API_KEY;

// Facebook
const FB_PIXEL_ID = process.env.FB_PIXEL_ID;
const FB_TOKEN = process.env.FB_TOKEN;

// Endpoint para gerar pagamento
app.post('/gerar-pagamento', async (req, res) => {
  const { external_id, payment_method, amount, buyer, tracking } = req.body;

  try {
    const response = await axios.post(
      'https://api.realtechdev.com.br/v1/transactions',
      {
        external_id,
        payment_method,
        amount,
        buyer,
        tracking
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.REALTECH_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const transaction = response.data.data;
    const transaction_id = transaction.id;

    console.log('📦 Body recebido do front:', req.body);
    console.log('✅ Resposta da RealTechDev:', response.status, response.data);

    // SALVA NO SUPABASE
    const { error: insertError } = await supabase.from('trackings').insert([
      {
        transaction_id: transaction_id,
        external_id: external_id,
        buyer_name: buyer.name,
        buyer_email: buyer.email,
        ref: tracking.ref || 'default_ref',
        src: tracking.src || 'default_src',
        sck: tracking.sck || 'default_sck',
        utm_source: tracking.utm?.source || '',
        utm_medium: tracking.utm?.medium || '',
        utm_campaign: tracking.utm?.campaign || '',
        utm_id: tracking.utm?.id || '',
        utm_term: tracking.utm?.term || '',
        utm_content: tracking.utm?.content || ''
      }
    ]);

    if (insertError) {
      console.error('❌ Erro ao salvar no Supabase:', insertError.message);
    } else {
      console.log('✅ Tracking salvo no Supabase com sucesso.');
    }

    res.json(transaction);
  } catch (error) {
    console.error('❌ Erro ao gerar pagamento:', error.message);
    res.status(500).json({ error: 'Erro ao gerar pagamento' });
  }
});

// Webhook para receber notificações
app.post('/webhook', async (req, res) => {
  const { event, data } = req.body;

  const transactionId = data?.id;
  console.log('📩 Webhook recebido:', JSON.stringify(req.body, null, 2));
  console.log('🔍 Transaction ID recebido no webhook:', transactionId);

  if (!transactionId) {
    console.warn('⚠️ Nenhum transaction_id no webhook.');
    return res.sendStatus(200);
  }

  // BUSCA tracking no Supabase
  const { data: trackingData, error } = await supabase
    .from('trackings')
    .select('*')
    .eq('transaction_id', transactionId)
    .maybeSingle();

  if (error) {
    console.error('❌ Erro ao buscar tracking no Supabase:', error.message);
    return res.sendStatus(200);
  }

  if (!trackingData) {
    console.warn('⚠️ Não encontrou tracking para transaction_id no banco');
  }

  // ENVIA PARA UTMIFY
  try {
    await axios.post(UTMIFY_API, {
      event: 'waiting_payment',
      utm: {
        source: trackingData?.utm_source,
        medium: trackingData?.utm_medium,
        campaign: trackingData?.utm_campaign,
        id: trackingData?.utm_id,
        term: trackingData?.utm_term,
        content: trackingData?.utm_content
      },
      ref: trackingData?.ref,
      src: trackingData?.src,
      sck: trackingData?.sck
    }, {
      headers: {
        Authorization: `Bearer ${UTMIFY_KEY}`
      }
    });
    console.log('✅ Evento waiting_payment enviado à UTMify');
  } catch (err) {
    console.error('❌ Erro ao enviar para UTMify:', err.message);
  }

  // ENVIA PARA FACEBOOK
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${FB_PIXEL_ID}/events?access_token=${FB_TOKEN}`,
      {
        data: [
          {
            event_name: 'InitiateCheckout',
            event_time: Math.floor(Date.now() / 1000),
            action_source: 'website',
            event_source_url: 'https://ajudeana.com.br/',
            user_data: {
              em: [hashEmail(data?.buyer?.email)]
            }
          }
        ]
      }
    );
    console.log('✅ Evento Facebook InitiateCheckout enviado');
  } catch (err) {
    console.error('❌ Erro ao enviar para o Facebook:', err.message);
  }

  // PUSHCUT (opcional)
  try {
    await axios.post('https://api.pushcut.io/v1/notifications/Doação Recebida', {
      text: `Doação pendente: R$ ${(data.total_amount / 100).toFixed(2)}`
    }, {
      headers: {
        Authorization: `Bearer ${process.env.PUSHCUT_KEY}`
      }
    });
    console.log('🚀 Pushcut enviado');
  } catch (err) {
    console.warn('⚠️ Pushcut falhou:', err.message);
  }

  res.sendStatus(200);
});

// Função de hash do e-mail (SHA256 base64 sem padding)
const crypto = require('crypto');
function hashEmail(email) {
  if (!email) return '';
  const hash = crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  return hash;
}

app.listen(port, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${port}`);
});
