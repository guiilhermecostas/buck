require('dotenv').config(); // Carrega variáveis do .env

const express = require('express');
const fetch = require('node-fetch'); // v2.x
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Rota principal do Pix
app.post('/pix', async (req, res) => {
  console.log('📦 Body recebido do front:', req.body);

  try {
    const response = await fetch('https://api.realtechdev.com.br/v1/transactions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.REALTECH_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    console.log('✅ Resposta da RealTechDev:', response.status, data);

    res.status(response.status).json(data);
  } catch (err) {
    console.error('❌ Erro ao conectar com a RealTechDev:', err);
    res.status(500).json({ error: 'Erro ao conectar com a RealTechDev' });
  }
});

// Escutar na porta correta para o Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
