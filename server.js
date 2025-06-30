const express = require('express');
const fetch = require('node-fetch'); // Use node-fetch v2.x
const cors = require('cors');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Rota para encaminhar requisição de PIX para a RealTechDev
app.post('/pix', async (req, res) => {
  console.log('📦 Body recebido do front:', req.body);

  try {
    const response = await fetch('https://api.realtechdev.com.br/v1/transactions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer sk_live_01bd360d98336b3fa11068dc8b3e1520',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();

    console.log('✅ Resposta da RealTechDev:', response.status, data);

    // Repasse a resposta para o frontend
    res.status(response.status).json(data);
  } catch (err) {
    console.error('❌ Erro ao conectar com a RealTechDev:', err);
    res.status(500).json({ error: 'Erro ao conectar com a RealTechDev' });
  }
});

// Inicia o servidor
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
