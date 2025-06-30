const express = require('express');
const fetch = require('node-fetch'); // versão 2.x do node-fetch
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/pix', async (req, res) => {
  console.log('Recebido body:', req.body);
  try {
    const response = await fetch('https://api.realtechdev.com.br/v1/transactions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer sk_live_01bd360d98336b3fa11068dc8b3e1520',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    console.log('Resposta da RealTechDev:', response.status, data);
    res.status(response.status).json(data);
  } catch (err) {
    console.error('Erro no fetch da RealTechDev:', err);
    res.status(500).json({ error: 'Erro ao conectar com a RealTechDev' });
  }
});

app.listen(3000, () => console.log('Servidor rodando em http://localhost:3000'));
