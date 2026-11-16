'use strict';
// Camada de dados offline: tudo fica guardado no aparelho (localStorage)
// e responde às mesmas "rotas" que o servidor antigo, então as telas não mudam.
const pad = (n) => String(n).padStart(2, '0');
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const erro = (msg) => new Error(msg);
const CHAVE = 'controle-gastos:v1';
const CATEGORIAS_PADRAO = ['Alimentação', 'Transporte', 'Moradia', 'Lazer', 'Saúde', 'Educação', 'Salário', 'Outros'];

const novosDados = () => ({
  versao: 1, prox: CATEGORIAS_PADRAO.length + 1,
  categorias: CATEGORIAS_PADRAO.map((nome, i) => ({ id: i + 1, nome })),
  lancamentos: [], metas: [], investimentos: [],
});
function lerDados() {
  let texto = null;
  try {
    texto = localStorage.getItem(CHAVE);
    if (texto) { const d = JSON.parse(texto); if (d && d.versao === 1) return d; }
  } catch { /* armazenamento indisponível ou dados ilegíveis */ }
  if (texto) { try { localStorage.setItem(CHAVE + ':corrompido', texto); } catch { /* sem espaço */ } } // não perde o original
  return novosDados();
}
let D = lerDados();
function salvar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(D)); }
  catch { throw erro('Não foi possível salvar neste aparelho. Verifique o espaço livre e se o modo privado está desligado.'); }
}

// ---------- Validações ----------
const dataValida = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
};
const cent = (v) => Math.round(Number(v) * 100);
const mesValido = (m) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(m || '') ? m : hoje().slice(0, 7));
const nomeCat = (id) => (D.categorias.find((c) => c.id === id) || { nome: '?' }).nome;

function validarLanc(b) {
  if (!['gasto', 'receita'].includes(b.tipo)) throw erro('Tipo inválido');
  const valor = Number(b.valor);
  if (!Number.isFinite(valor) || valor <= 0 || valor > 1e9) throw erro('Valor inválido');
  if (!dataValida(String(b.data || ''))) throw erro('Data inválida');
  const cat = D.categorias.find((c) => c.id === Number(b.categoria_id));
  if (!cat) throw erro('Categoria inválida');
  return { tipo: b.tipo, valor_centavos: cent(valor), data: b.data, categoria_id: cat.id, descricao: String(b.descricao || '').trim().slice(0, 100) };
}
function validarInv(b) {
  const nome = String(b.nome || '').trim();
  if (!nome || nome.length > 60) throw erro('Informe o nome do objetivo (até 60 caracteres)');
  const alvo = cent(b.alvo);
  if (!Number.isFinite(alvo) || alvo <= 0 || alvo > 1e11) throw erro('Valor do objetivo inválido');
  const inv = cent(b.investido || 0);
  if (!Number.isFinite(inv) || inv < 0 || inv > 1e11) throw erro('Valor investido inválido');
  if (!dataValida(String(b.prazo || ''))) throw erro('Prazo inválido');
  return { nome, alvo_centavos: alvo, investido_centavos: inv, prazo: b.prazo };
}
const gastoDoMes = (mes, catId) => D.lancamentos
  .filter((l) => l.tipo === 'gasto' && l.data.slice(0, 7) === mes && (catId === null || l.categoria_id === catId))
  .reduce((s, l) => s + l.valor_centavos, 0);

// ---------- "Rotas" locais ----------
function local(metodo, caminho, q, b) {
  let m;
  if (caminho === '/api/categorias' && metodo === 'GET')
    return [...D.categorias].sort((x, y) => x.nome.localeCompare(y.nome, 'pt'));

  if (caminho === '/api/lancamentos') {
    if (metodo === 'GET') {
      const mes = mesValido(q.get('mes'));
      return D.lancamentos.filter((l) => l.data.slice(0, 7) === mes)
        .sort((x, y) => y.data.localeCompare(x.data) || y.id - x.id)
        .map((l) => ({ ...l, categoria: nomeCat(l.categoria_id) }));
    }
    if (metodo === 'POST') { const v = validarLanc(b); const id = D.prox++; D.lancamentos.push({ id, ...v }); salvar(); return { id }; }
  }
  if ((m = /^\/api\/lancamentos\/(\d+)$/.exec(caminho))) {
    const i = D.lancamentos.findIndex((l) => l.id === +m[1]);
    if (i < 0) throw erro('Lançamento não encontrado');
    if (metodo === 'PUT') { D.lancamentos[i] = { id: +m[1], ...validarLanc(b) }; salvar(); return { ok: true }; }
    if (metodo === 'DELETE') { D.lancamentos.splice(i, 1); salvar(); return { ok: true }; }
  }

  if (caminho === '/api/resumo' && metodo === 'GET') {
    const mes = mesValido(q.get('mes')); let receitas = 0, gastos = 0; const por = new Map();
    for (const l of D.lancamentos) {
      if (l.data.slice(0, 7) !== mes) continue;
      if (l.tipo === 'receita') receitas += l.valor_centavos;
      else { gastos += l.valor_centavos; por.set(l.categoria_id, (por.get(l.categoria_id) || 0) + l.valor_centavos); }
    }
    return { mes, receitas, gastos, saldo: receitas - gastos,
      porCategoria: [...por].map(([id, total]) => ({ nome: nomeCat(id), total })).sort((a, c) => c.total - a.total) };
  }

  if (caminho === '/api/metas') {
    if (metodo === 'GET') {
      const mes = mesValido(q.get('mes'));
      return D.metas.map((mt) => ({ id: mt.id, categoria_id: mt.categoria_id,
        categoria: mt.categoria_id === null ? 'Geral' : nomeCat(mt.categoria_id),
        limite_centavos: mt.limite_centavos, gasto_centavos: gastoDoMes(mes, mt.categoria_id) }))
        .sort((a, c) => (a.categoria_id !== null) - (c.categoria_id !== null) || a.categoria.localeCompare(c.categoria, 'pt'));
    }
    if (metodo === 'PUT') {
      const limite = cent(b.valor);
      if (!Number.isFinite(limite) || limite <= 0 || limite > 1e11) throw erro('Valor inválido');
      let cat = null;
      if (b.categoria_id !== null && b.categoria_id !== undefined && b.categoria_id !== '') {
        const c = D.categorias.find((x) => x.id === Number(b.categoria_id));
        if (!c) throw erro('Categoria inválida');
        cat = c.id;
      }
      const ex = D.metas.find((x) => x.categoria_id === cat);
      if (ex) ex.limite_centavos = limite; else D.metas.push({ id: D.prox++, categoria_id: cat, limite_centavos: limite });
      salvar(); return { ok: true };
    }
  }
  if ((m = /^\/api\/metas\/(\d+)$/.exec(caminho)) && metodo === 'DELETE') {
    const i = D.metas.findIndex((x) => x.id === +m[1]);
    if (i < 0) throw erro('Meta não encontrada');
    D.metas.splice(i, 1); salvar(); return { ok: true };
  }

  if (caminho === '/api/investimentos') {
    if (metodo === 'GET') return [...D.investimentos].sort((a, c) => a.prazo.localeCompare(c.prazo) || a.id - c.id);
    if (metodo === 'POST') { const v = validarInv(b); const id = D.prox++; D.investimentos.push({ id, ...v }); salvar(); return { id }; }
  }
  if ((m = /^\/api\/investimentos\/(\d+)\/aporte$/.exec(caminho)) && metodo === 'POST') {
    const inv = D.investimentos.find((x) => x.id === +m[1]);
    if (!inv) throw erro('Objetivo não encontrado');
    const valor = cent(b.valor);
    if (!Number.isFinite(valor) || valor <= 0 || valor > 1e11) throw erro('Valor do aporte inválido');
    inv.investido_centavos += valor; salvar(); return { ok: true };
  }
  if ((m = /^\/api\/investimentos\/(\d+)$/.exec(caminho))) {
    const i = D.investimentos.findIndex((x) => x.id === +m[1]);
    if (i < 0) throw erro('Objetivo não encontrado');
    if (metodo === 'PUT') { D.investimentos[i] = { id: +m[1], ...validarInv(b) }; salvar(); return { ok: true }; }
    if (metodo === 'DELETE') { D.investimentos.splice(i, 1); salvar(); return { ok: true }; }
  }
  throw erro('Operação não encontrada');
}

// Mesma assinatura usada pelas telas. Se algo falhar, os dados em memória voltam ao estado anterior.
async function api(url, metodo = 'GET', corpo = {}) {
  const u = new URL(url, 'http://x');
  if (metodo === 'GET') return local(metodo, u.pathname, u.searchParams, corpo);
  const antes = JSON.stringify(D);
  try { return local(metodo, u.pathname, u.searchParams, corpo); }
  catch (e) { D = JSON.parse(antes); throw e; }
}

// ---------- Backup ----------
function validarBackup(d) {
  const ok = (c) => { if (!c) throw erro('Arquivo de backup inválido'); };
  const int = (n) => Number.isInteger(n) && n > 0;
  ok(d && d.versao === 1 && ['categorias', 'lancamentos', 'metas', 'investimentos'].every((k) => Array.isArray(d[k])));
  const categorias = d.categorias.map((c) => {
    ok(int(c.id) && typeof c.nome === 'string' && c.nome.trim() && c.nome.length <= 40);
    return { id: c.id, nome: c.nome.trim() };
  });
  const ids = new Set(categorias.map((c) => c.id));
  const lancamentos = d.lancamentos.map((l) => {
    ok(int(l.id) && ['gasto', 'receita'].includes(l.tipo) && int(l.valor_centavos) && dataValida(l.data) && ids.has(l.categoria_id));
    return { id: l.id, tipo: l.tipo, valor_centavos: l.valor_centavos, data: l.data, categoria_id: l.categoria_id, descricao: String(l.descricao || '').slice(0, 100) };
  });
  const metas = d.metas.map((x) => {
    ok(int(x.id) && int(x.limite_centavos) && (x.categoria_id === null || ids.has(x.categoria_id)));
    return { id: x.id, categoria_id: x.categoria_id, limite_centavos: x.limite_centavos };
  });
  const investimentos = d.investimentos.map((i) => {
    ok(int(i.id) && typeof i.nome === 'string' && i.nome.trim() && i.nome.length <= 60 && int(i.alvo_centavos)
      && Number.isInteger(i.investido_centavos) && i.investido_centavos >= 0 && dataValida(i.prazo));
    return { id: i.id, nome: i.nome.trim(), alvo_centavos: i.alvo_centavos, investido_centavos: i.investido_centavos, prazo: i.prazo };
  });
  for (const lista of [categorias, lancamentos, metas, investimentos]) ok(new Set(lista.map((x) => x.id)).size === lista.length);
  const maior = [categorias, lancamentos, metas, investimentos].flat().reduce((mx, x) => Math.max(mx, x.id), 0);
  return { versao: 1, prox: maior + 1, categorias, lancamentos, metas, investimentos };
}
const exportarDados = () => JSON.stringify(D, null, 2);
function importarDados(texto) {
  let bruto;
  try { bruto = JSON.parse(texto); } catch { throw erro('Arquivo de backup inválido'); }
  const novo = validarBackup(bruto), antes = D;
  D = novo;
  try { salvar(); } catch (e) { D = antes; throw e; }
}
