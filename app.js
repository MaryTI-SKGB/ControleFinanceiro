'use strict';
// Telas do app. Os dados vêm de dados.js (carregado antes), que funciona totalmente offline.
const $ = (s) => document.querySelector(s);
const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const COR = ['#0f766e', '#c2410c', '#2563eb', '#a21caf', '#ca8a04', '#dc2626', '#0891b2', '#65a30d', '#7c3aed'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
let mes = hoje().slice(0, 7), view = 'resumo', editando = null, categorias = [], metaEditando = null;

function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto; // textContent evita injeção de HTML (XSS)
  return e;
}
async function mostrarApp() {
  categorias = await api('/api/categorias');
  $('#f-cat').replaceChildren(...categorias.map((c) => Object.assign(el('option', '', c.nome), { value: c.id })));
  $('#meta-cat').replaceChildren(Object.assign(el('option', '', 'Geral (todos os gastos)'), { value: '' }),
    ...categorias.map((c) => Object.assign(el('option', '', c.nome), { value: c.id })));
  novoLancamento(); trocarView('resumo');
}

// ---------- Navegação ----------
function trocarView(v) {
  view = v;
  for (const s of ['resumo', 'lista', 'metas', 'invest', 'novo']) $('#v-' + s).hidden = s !== v;
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === v));
  $('#m-nome').textContent = `${MESES[+mes.slice(5) - 1]} de ${mes.slice(0, 4)}`;
  if (v === 'resumo') carregarResumo(); else if (v === 'lista') carregarLista(); else if (v === 'metas') carregarMetas(); else if (v === 'invest') carregarInvest(); else $('#f-titulo').textContent = editando ? 'Editar lançamento' : 'Novo lançamento';
}
document.querySelectorAll('nav button').forEach((b) => (b.onclick = () => { if (b.dataset.v === 'novo' && view !== 'novo') novoLancamento(); trocarView(b.dataset.v); }));
function mudarMes(d) {
  let [a, m] = mes.split('-').map(Number); m += d;
  if (m < 1) { m = 12; a--; } if (m > 12) { m = 1; a++; }
  mes = `${a}-${pad(m)}`; trocarView(view);
}
$('#m-ant').onclick = () => mudarMes(-1);
$('#m-prox').onclick = () => mudarMes(1);

// ---------- Resumo e gráficos ----------
async function carregarResumo() {
  const r = await api('/api/resumo?mes=' + mes);
  $('#r-rec').textContent = brl(r.receitas);
  $('#r-gas').textContent = brl(r.gastos);
  $('#r-sal').textContent = brl(r.saldo);
  $('#r-sal').className = r.saldo < 0 ? 'gasto' : 'rec';
  const total = r.porCategoria.reduce((s, c) => s + c.total, 0);
  const donut = $('#donut'), ul = $('#cats');
  ul.replaceChildren();
  $('#cats-vazio').hidden = total > 0; donut.hidden = total === 0;
  let acc = 0; const fatias = [];
  r.porCategoria.forEach((c, i) => {
    const ini = (acc / total) * 100; acc += c.total;
    fatias.push(`${COR[i % COR.length]} ${ini}% ${(acc / total) * 100}%`);
    const li = el('li'), linha = el('div', 'linha'), barra = el('div', 'barra');
    linha.append(el('span', '', c.nome), el('b', '', `${brl(c.total)} (${Math.round((c.total / total) * 100)}%)`));
    barra.style.width = (c.total / r.porCategoria[0].total) * 100 + '%';
    barra.style.background = COR[i % COR.length];
    li.append(linha, barra); ul.append(li);
  });
  if (total) donut.style.background = `conic-gradient(${fatias.join(',')})`;
}

// ---------- Lista, criação, edição e exclusão ----------
async function carregarLista() {
  const itens = await api('/api/lancamentos?mes=' + mes);
  $('#lista-vazia').hidden = itens.length > 0;
  $('#lista').replaceChildren(...itens.map((l) => {
    const li = el('li'), b = el('button'), esq = el('span'), dir = el('b', l.tipo === 'gasto' ? 'gasto' : 'rec');
    esq.append(el('span', '', l.descricao || l.categoria), el('small', '', `${l.categoria} · ${l.data.split('-').reverse().join('/')}`));
    dir.textContent = (l.tipo === 'gasto' ? '− ' : '+ ') + brl(l.valor_centavos);
    b.append(esq, dir); b.onclick = () => editar(l); li.append(b); return li;
  }));
}
function novoLancamento() {
  editando = null; $('#form-lanc').reset(); $('#f-data').value = hoje();
  $('#f-excluir').hidden = true; $('#f-erro').textContent = '';
}
function editar(l) {
  editando = l.id;
  document.querySelector(`input[name=tipo][value=${l.tipo}]`).checked = true;
  $('#f-valor').value = (l.valor_centavos / 100).toFixed(2).replace('.', ',');
  $('#f-data').value = l.data; $('#f-cat').value = l.categoria_id; $('#f-desc').value = l.descricao;
  $('#f-excluir').hidden = false; trocarView('novo');
}
$('#form-lanc').onsubmit = async (e) => {
  e.preventDefault(); $('#f-erro').textContent = '';
  const corpo = {
    tipo: document.querySelector('input[name=tipo]:checked').value,
    valor: $('#f-valor').value.replace(/\./g, '').replace(',', '.'),
    data: $('#f-data').value, categoria_id: $('#f-cat').value, descricao: $('#f-desc').value,
  };
  try {
    if (editando) await api('/api/lancamentos/' + editando, 'PUT', corpo); else await api('/api/lancamentos', 'POST', corpo);
    mes = corpo.data.slice(0, 7); novoLancamento(); trocarView('lista');
  } catch (err) { $('#f-erro').textContent = err.message; }
};
$('#f-excluir').onclick = async () => {
  if (!confirm('Excluir este lançamento?')) return;
  try { await api('/api/lancamentos/' + editando, 'DELETE'); novoLancamento(); trocarView('lista'); }
  catch (err) { $('#f-erro').textContent = err.message; }
};

// ---------- Metas ----------
async function carregarMetas() {
  const itens = await api('/api/metas?mes=' + mes);
  $('#metas-vazia').hidden = itens.length > 0;
  $('#metas').replaceChildren(...itens.map((m) => {
    const pct = Math.round((m.gasto_centavos / m.limite_centavos) * 100);
    const resto = m.limite_centavos - m.gasto_centavos;
    const li = el('li'), b = el('button'), topo = el('div', 'linha'), trilho = el('div', 'trilho'), barra = el('div', 'preench');
    topo.append(el('b', '', m.categoria_id === null ? 'Meta geral' : m.categoria), el('b', '', pct + '%'));
    barra.style.width = Math.min(pct, 100) + '%';
    if (pct >= 100) barra.classList.add('estourou'); else if (pct >= 80) barra.classList.add('alerta');
    trilho.append(barra);
    const info = el('small', '', `${brl(m.gasto_centavos)} de ${brl(m.limite_centavos)} · ` + (resto >= 0 ? `restam ${brl(resto)}` : `excedeu em ${brl(-resto)}`));
    b.append(topo, trilho, info);
    b.onclick = () => {
      metaEditando = m.id; $('#meta-cat').value = m.categoria_id ?? '';
      $('#meta-valor').value = (m.limite_centavos / 100).toFixed(2).replace('.', ','); $('#meta-excluir').hidden = false;
      $('#meta-valor').focus();
    };
    li.append(b); return li;
  }));
}
function limparMeta() { metaEditando = null; $('#form-meta').reset(); $('#meta-excluir').hidden = true; $('#meta-erro').textContent = ''; }
$('#form-meta').onsubmit = async (e) => {
  e.preventDefault(); $('#meta-erro').textContent = '';
  try {
    await api('/api/metas', 'PUT', { categoria_id: $('#meta-cat').value || null, valor: $('#meta-valor').value.replace(/\./g, '').replace(',', '.') });
    limparMeta(); carregarMetas();
  } catch (err) { $('#meta-erro').textContent = err.message; }
};
$('#meta-excluir').onclick = async () => {
  if (!confirm('Excluir esta meta?')) return;
  try { await api('/api/metas/' + metaEditando, 'DELETE'); limparMeta(); carregarMetas(); }
  catch (err) { $('#meta-erro').textContent = err.message; }
};

// ---------- Investimentos (objetivos futuros) ----------
const num = (s) => s.replace(/\./g, '').replace(',', '.');
const dataBR = (s) => s.split('-').reverse().join('/');
let invEditando = null, aporteId = null;
async function carregarInvest() {
  const itens = await api('/api/investimentos');
  $('#invest-vazio').hidden = itens.length > 0;
  $('#invest').replaceChildren(...itens.map((i) => {
    const pct = Math.round((i.investido_centavos / i.alvo_centavos) * 100);
    const falta = i.alvo_centavos - i.investido_centavos;
    const dias = Math.round((new Date(i.prazo + 'T00:00:00') - new Date(hoje() + 'T00:00:00')) / 864e5);
    const li = el('li'), topo = el('div', 'linha'), trilho = el('div', 'trilho'), barra = el('div', 'preench'), acoes = el('div', 'acoes');
    topo.append(el('b', '', i.nome), el('b', '', pct + '%'));
    barra.style.width = Math.min(pct, 100) + '%';
    if (falta > 0 && dias < 0) barra.classList.add('estourou');
    trilho.append(barra);
    let status;
    if (falta <= 0) status = 'Objetivo atingido';
    else if (dias < 0) status = `Prazo vencido há ${-dias} dia${dias < -1 ? 's' : ''} · faltam ${brl(falta)}`;
    else if (dias === 0) status = `O prazo é hoje · faltam ${brl(falta)}`;
    else status = `Até ${dataBR(i.prazo)} (${dias} dia${dias > 1 ? 's' : ''}) · faltam ${brl(falta)} · guardar cerca de ${brl(Math.ceil(falta / Math.max(1, Math.ceil(dias / 30))))} por mês`;
    const btnAp = el('button', '', '+ Aportar'), btnEd = el('button', '', 'Editar');
    btnAp.onclick = () => { aporteId = i.id; $('#ap-nome').textContent = 'Aportar em: ' + i.nome; $('#form-aporte').hidden = false; $('#ap-valor').focus(); $('#form-aporte').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    btnEd.onclick = () => {
      invEditando = i.id; $('#inv-nome').value = i.nome;
      $('#inv-alvo').value = (i.alvo_centavos / 100).toFixed(2).replace('.', ',');
      $('#inv-atual').value = (i.investido_centavos / 100).toFixed(2).replace('.', ',');
      $('#inv-prazo').value = i.prazo; $('#inv-titulo').textContent = 'Editar objetivo';
      $('#inv-excluir').hidden = false; $('#inv-limpar').hidden = false; $('#inv-nome').scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    acoes.append(btnAp, btnEd);
    li.append(topo, trilho, el('small', '', `${brl(i.investido_centavos)} de ${brl(i.alvo_centavos)}`), el('small', '', status), acoes);
    return li;
  }));
}
function limparInv() {
  invEditando = null; $('#form-inv').reset(); $('#inv-titulo').textContent = 'Novo objetivo';
  $('#inv-excluir').hidden = true; $('#inv-limpar').hidden = true; $('#inv-erro').textContent = '';
}
function fecharAporte() { aporteId = null; $('#form-aporte').reset(); $('#form-aporte').hidden = true; $('#ap-erro').textContent = ''; }
$('#inv-limpar').onclick = limparInv;
$('#ap-cancelar').onclick = fecharAporte;
$('#form-inv').onsubmit = async (e) => {
  e.preventDefault(); $('#inv-erro').textContent = '';
  const corpo = { nome: $('#inv-nome').value, alvo: num($('#inv-alvo').value), investido: num($('#inv-atual').value || '0'), prazo: $('#inv-prazo').value };
  try {
    if (invEditando) await api('/api/investimentos/' + invEditando, 'PUT', corpo); else await api('/api/investimentos', 'POST', corpo);
    limparInv(); carregarInvest();
  } catch (err) { $('#inv-erro').textContent = err.message; }
};
$('#form-aporte').onsubmit = async (e) => {
  e.preventDefault(); $('#ap-erro').textContent = '';
  try { await api(`/api/investimentos/${aporteId}/aporte`, 'POST', { valor: num($('#ap-valor').value) }); fecharAporte(); carregarInvest(); }
  catch (err) { $('#ap-erro').textContent = err.message; }
};
$('#inv-excluir').onclick = async () => {
  if (!confirm('Excluir este objetivo?')) return;
  try { await api('/api/investimentos/' + invEditando, 'DELETE'); limparInv(); carregarInvest(); }
  catch (err) { $('#inv-erro').textContent = err.message; }
};

// ---------- Backup ----------
$('#bk-exportar').onclick = () => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([exportarDados()], { type: 'application/json' }));
  link.download = `controle-gastos-${hoje()}.json`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  $('#bk-msg').textContent = 'Backup exportado. Guarde o arquivo em um lugar seguro.';
};
$('#bk-importar').onchange = async (e) => {
  const arquivo = e.target.files[0]; e.target.value = '';
  if (!arquivo) return;
  try {
    const texto = await arquivo.text();
    if (!confirm('Importar vai SUBSTITUIR todos os dados atuais deste aparelho. Continuar?')) return;
    importarDados(texto); await mostrarApp();
    $('#bk-msg').textContent = 'Backup importado com sucesso.';
  } catch (err) { $('#bk-msg').textContent = err.message; }
};

// ---------- Início ----------
mostrarApp();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); // pede ao navegador para não apagar os dados
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
