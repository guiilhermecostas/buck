const express = require('express');
<<<<<<< HEAD
const fetch = require('node-fetch'); // Use node-fetch v2.x
const cors = require('cors');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Rota para encaminhar requisição de PIX para a RealTechDev
app.post('/pix', async (req, res) => {
  console.log('📦 Body recebido do front:', req.body);

=======
const fetch = require('node-fetch'); // versão 2.x do node-fetch
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/pix', async (req, res) => {
  console.log('Recebido body:', req.body);
>>>>>>> aafed4b (first commit)
  try {
    const response = await fetch('https://api.realtechdev.com.br/v1/transactions', {
      method: 'POST',
      headers: {
<<<<<<< HEAD
        Authorization: 'Bearer sk_live_a12d9256813386a349082bf83fe9c58c',
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
=======
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
>>>>>>> aafed4b (first commit)
    res.status(500).json({ error: 'Erro ao conectar com a RealTechDev' });
  }
});

<<<<<<< HEAD
// Inicia o servidor
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
=======
app.listen(3000, () => console.log('Servidor rodando em http://localhost:3000'));
>>>>>>> aafed4b (first commit)
