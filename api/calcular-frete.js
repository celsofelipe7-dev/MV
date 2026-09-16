// =====================================================================
// api/calcular-frete.js — Vercel Serverless Function
//
// Modelo: frete FIXO por estado. O valor nao depende do peso da peca.
// Fonte dos dados: ../fretes.json (gerado a partir da planilha)
//
// Nao precisa de npm install. Nao precisa de variavel de ambiente.
// =====================================================================

const tabela = require('../fretes.json');

// Indexa as faixas uma unica vez, quando a funcao sobe.
const FAIXAS = [...tabela.faixas].sort((a, b) => a.cepInicio - b.cepInicio);
const MARGEM = Number(tabela.margem) || 0;

function buscarFaixa(cepNum) {
  // Busca binaria: a tabela esta ordenada por cepInicio.
  let lo = 0, hi = FAIXAS.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const f = FAIXAS[mid];
    if (cepNum < f.cepInicio) hi = mid - 1;
    else if (cepNum > f.cepFim) lo = mid + 1;
    else return f;
  }
  return null;
}

function brl(v) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, erro: 'Use POST' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const cep = String(body.cep || '').replace(/\D/g, '');
    const produto = String(body.produto || '').trim() || null;

    if (cep.length !== 8) {
      return res.status(400).json({ ok: false, erro: 'CEP deve ter 8 digitos' });
    }

    const faixa = buscarFaixa(parseInt(cep, 10));

    // Fora de cobertura: Regiao Norte ou CEP inexistente.
    if (!faixa) {
      return res.status(200).json({
        ok: false,
        foraDeCobertura: true,
        cep,
        mensagem: 'Ainda nao entregamos automaticamente nessa regiao. '
                + 'Fale com a gente no WhatsApp que cotamos um frete sob medida.',
      });
    }

    const valor = Math.round(faixa.valor * (1 + MARGEM) * 100) / 100;

    // Cidade via ViaCEP. Se falhar, o calculo segue sem ela.
    let cidade = null;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: ctrl.signal });
      clearTimeout(t);
      const d = await r.json();
      if (!d.erro) cidade = d.localidade;
    } catch (_) { /* segue sem a cidade */ }

    return res.status(200).json({
      ok: true,
      cep,
      cidade,
      estado: faixa.estado,
      uf: faixa.uf,
      regiao: faixa.regiao,
      produto,
      valor,
      valorFormatado: brl(valor),
      prazo: faixa.prazo,
    });

  } catch (err) {
    console.error('Erro em /api/calcular-frete:', err);
    return res.status(500).json({
      ok: false,
      erro: 'Nao foi possivel calcular o frete agora. Fale com a gente no WhatsApp.',
    });
  }
};
