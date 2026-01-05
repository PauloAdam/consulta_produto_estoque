require('dotenv').config()
const express = require('express')
const axios = require('axios')
const cors = require('cors')
const path = require('path')

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.static('public'))

const PORT = process.env.PORT || 3000
const BLING_API = 'https://api.bling.com.br/Api/v3'

// ==========================
// 🔄 REFRESH TOKEN
// ==========================
async function refreshToken() {
  const basic = Buffer.from(
    `${process.env.BLING_CLIENT_ID}:${process.env.BLING_CLIENT_SECRET}`
  ).toString('base64')

  const response = await axios.post(
    `${BLING_API}/oauth/token`,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.BLING_REFRESH_TOKEN
    }),
    {
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  )

  process.env.BLING_ACCESS_TOKEN = response.data.access_token
  process.env.BLING_REFRESH_TOKEN = response.data.refresh_token

  console.log('🔄 Token Bling renovado')
}

// ==========================
// 🔐 AXIOS COM INTERCEPTOR
// ==========================
const api = axios.create({
  baseURL: BLING_API,
  timeout: 10000
})

api.interceptors.request.use(config => {
  config.headers.Authorization = `Bearer ${process.env.BLING_ACCESS_TOKEN}`
  return config
})

api.interceptors.response.use(
  res => res,
  async error => {
    if (
      error.response?.data?.error?.type === 'invalid_token' ||
      error.response?.status === 401
    ) {
      await refreshToken()
      error.config.headers.Authorization = `Bearer ${process.env.BLING_ACCESS_TOKEN}`
      return api.request(error.config)
    }
    throw error
  }
)

// ==========================
// 🏠 HOME
// ==========================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

// ==========================
// 📦 PRODUTO POR GTIN
// ==========================
app.get('/produto/:gtin', async (req, res) => {
  const gtin = req.params.gtin
  const idDeposito = process.env.BLING_ID_DEPOSITO

  try {
    // 🔍 Produto
    const prodResp = await api.get('/produtos', {
      params: {
        'gtins[]': gtin,
        criterio: 2,
        limite: 5
      }
    })

    const produto = prodResp.data?.data?.[0]

    if (!produto) {
      return res.status(404).json({ erro: 'Produto não encontrado' })
    }

    // 📦 Estoque (CORRETO)
    const estoqueResp = await api.get('/estoques/saldos', {
      params: {
        'idsProdutos[]': produto.id,
        idDeposito
      }
    })

    const estoqueData = estoqueResp.data?.data?.[0] || {}

    const saldo =
      estoqueData.saldoVirtualTotal ??
      estoqueData.saldoVirtual ??
      estoqueData.saldo ??
      0

    // 🖼️ imagem melhor
    let imagem = produto.imagemURL || ''
    if (imagem.includes('miniatura')) {
      imagem = imagem.replace('miniatura', '')
    }

    res.json({
      nome: produto.nome,
      estoque: saldo,
      imagem
    })
  } catch (err) {
    console.error('❌ Erro Bling:', err.response?.data || err.message)
    res.status(500).json({ erro: 'Erro ao consultar Bling' })
  }
})

// ==========================
// 🚀 START
// ==========================
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`)
})
