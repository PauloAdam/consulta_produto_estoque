require('dotenv').config()
const express = require('express')
const axios = require('axios')
const cors = require('cors')
const path = require('path')

/* =========================
   APP
========================= */
const app = express()
app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

/* ⚠️ CPANEL USA PORT OBRIGATÓRIA */
const PORT = process.env.PORT
const BLING_API = 'https://api.bling.com.br/Api/v3'

/* =========================
   🔄 REFRESH TOKEN
========================= */
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

/* =========================
   🔐 AXIOS COM INTERCEPTOR
========================= */
const api = axios.create({
    baseURL: BLING_API,
    timeout: 15000
})

api.interceptors.request.use(config => {
    config.headers.Authorization = `Bearer ${process.env.BLING_ACCESS_TOKEN}`
    return config
})

api.interceptors.response.use(
    res => res,
    async error => {
        if (
            error.response?.status === 401 ||
            error.response?.data?.error?.type === 'invalid_token'
        ) {
            await refreshToken()
            error.config.headers.Authorization = `Bearer ${process.env.BLING_ACCESS_TOKEN}`
            return api.request(error.config)
        }
        throw error
    }
)

/* =========================
   🏠 HOME
========================= */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

/* =========================
   📦 PRODUTO POR GTIN OU SKU
========================= */
app.get('/produto/:codigo', async (req, res) => {
    const codigo = req.params.codigo
    const idDeposito = process.env.BLING_ID_DEPOSITO

    try {
        let produto = null

        const respGtin = await api.get('/produtos', {
            params: {
                'gtins[]': codigo,
                criterio: 2,
                limite: 1
            }
        })

        produto = respGtin.data?.data?.[0] || null

        if (!produto) {
            const respSku = await api.get('/produtos', {
                params: { codigo, limite: 1 }
            })
            produto = respSku.data?.data?.[0] || null
        }

        if (!produto) {
            return res.status(404).json({ erro: 'Produto não encontrado' })
        }

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

        let imagem = produto.imagemURL || ''
        if (imagem.includes('miniatura')) {
            imagem = imagem.replace('miniatura', '')
        }

        res.json({
            id: produto.id,
            nome: produto.nome,
            sku: produto.codigo,
            gtin: produto.gtin,
            estoque: saldo,
            imagem
        })
    } catch (err) {
        console.error('❌ Erro Bling:', err.response?.data || err.message)
        res.status(500).json({ erro: 'Erro ao consultar Bling' })
    }
})

/* =========================
   🚀 START SERVER (CPANEL)
========================= */
app.listen(PORT, () => {
    console.log('🚀 Servidor rodando na porta', PORT)
})
