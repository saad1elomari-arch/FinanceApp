(function () {
  'use strict';

  // Safari/iPhone compatibility + missing application controller.
  // This file intentionally sits after the existing inline script.

  const $ = (id) => document.getElementById(id);
  const esc = window.esc || function (v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  };
  window.esc = esc;

  window.uid = window.uid || function () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };

  window.currentMonth = window.currentMonth || function () {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  };

  window.monthKey = window.monthKey || function (date) {
    return String(date || '').slice(0,7);
  };

  window.money = window.money || function (n) {
    return `${new Intl.NumberFormat('fr-FR', {maximumFractionDigits: 2}).format(Number(n)||0)} MAD`;
  };

  window.dateFmt = window.dateFmt || function (s) {
    if (!s) return '';
    const [y,m,d] = String(s).split('-').map(Number);
    return new Date(y, m-1, d).toLocaleDateString('fr-FR', {
      day:'2-digit', month:'short', year:'numeric'
    }).replace('.', '');
  };

  window.monthLabel = window.monthLabel || function (m) {
    const [y,mo] = String(m).split('-').map(Number);
    return new Date(y,mo-1,1).toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
  };

  window.monthsRange = window.monthsRange || function (count) {
    const out = [], d = new Date();
    d.setDate(1);
    for (let i=count-1;i>=0;i--) {
      const x = new Date(d.getFullYear(), d.getMonth()-i, 1);
      out.push(`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}`);
    }
    return out;
  };

  window.getCat = window.getCat || function (id) {
    return state.categories.find(c => c.id === id);
  };

  window.sumFor = window.sumFor || function (m, type) {
    return state.transactions
      .filter(t => monthKey(t.date) === m && t.type === type)
      .reduce((a,t) => a + Number(t.amount || 0), 0);
  };

  function toast(msg) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }
  window.toast = toast;

  function setMonthOptions(select, selected) {
    if (!select) return;
    const months = monthsRange(13).reverse();
    select.innerHTML = months.map(m =>
      `<option value="${m}">${monthLabel(m)}</option>`
    ).join('');
    select.value = selected || currentMonth();
  }

  function populateCategorySelect() {
    const select = $('txCategory');
    const picker = $('txCategoryPicker');
    if (!select || !picker) return;

    const cats = state.categories.filter(c => c.kind === currentType);
    select.innerHTML = cats.map(c =>
      `<option value="${esc(c.id)}">${esc(c.name)}</option>`
    ).join('');

    picker.innerHTML = cats.map(c =>
      `<button type="button" class="category-option" data-category="${esc(c.id)}">
        <span class="cat-emoji">${c.icon || '•'}</span>
        <span>${esc(c.name)}</span>
      </button>`
    ).join('');

    picker.querySelectorAll('[data-category]').forEach(btn => {
      btn.addEventListener('click', () => {
        select.value = btn.dataset.category;
        picker.querySelectorAll('.category-option').forEach(x => x.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });

    if (cats.length) {
      select.value = select.value && cats.some(c=>c.id===select.value) ? select.value : cats[0].id;
      const active = picker.querySelector(`[data-category="${CSS.escape(select.value)}"]`);
      if (active) active.classList.add('selected');
    }
  }

  function setType(type) {
    currentType = type;
    const inc = $('incomeToggle'), out = $('expenseToggle');
    inc?.classList.toggle('active', type === 'income');
    out?.classList.toggle('active', type === 'expense');
    populateCategorySelect();
  }

  window.openTxModal = function (id=null, forcedType=null, forcedCategory=null) {
    editId = id;
    const existing = id ? state.transactions.find(t => t.id === id) : null;
    setType(forcedType || existing?.type || 'income');

    $('modalTitle').textContent = existing ? 'Modifier la transaction' : 'Ajouter une transaction';
    $('txLabel').value = existing?.label || '';
    $('txAmount').value = existing?.amount ?? '';
    $('txDate').value = existing?.date || todayISO();
    $('txNote').value = existing?.note || '';

    populateCategorySelect();
    if (forcedCategory) $('txCategory').value = forcedCategory;
    if (existing) $('txCategory').value = existing.category;

    const selected = $('txCategoryPicker')?.querySelector(`[data-category="${CSS.escape($('txCategory').value)}"]`);
    $('txCategoryPicker')?.querySelectorAll('.category-option').forEach(x => x.classList.remove('selected'));
    selected?.classList.add('selected');

    $('modalBackdrop').classList.add('open');
    setTimeout(() => $('txLabel')?.focus(), 30);
  };

  window.deleteTx = function (id) {
    if (!confirm('Supprimer cette transaction ?')) return;
    state.transactions = state.transactions.filter(t => t.id !== id);
    save();
    renderAll();
    toast('Transaction supprimée');
  };

  function closeTxModal() {
    $('modalBackdrop')?.classList.remove('open');
    $('txForm')?.reset();
    editId = null;
  }

  function navigate(page) {
    activePage = page;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = $(`page-${page}`);
    if (target) target.classList.add('active');

    document.querySelectorAll('[data-page]').forEach(b =>
      b.classList.toggle('active', b.dataset.page === page)
    );

    if (page === 'dashboard') renderDashboard();
    if (page === 'transactions') {
      populateTransactionFilters();
      renderTransactions();
    }
    if (page === 'budgets') renderBudgets();
    if (page === 'categories') renderCategories();
    if (page === 'settings') updateLocalStatus();
    window.scrollTo({top:0, behavior:'instant'});
  }

  function populateTransactionFilters() {
    const select = $('catFilter');
    if (!select) return;
    const old = select.value || 'all';
    select.innerHTML =
      `<option value="all">Toutes les catégories</option>` +
      state.categories.map(c => `<option value="${esc(c.id)}">${c.icon || '•'} ${esc(c.name)}</option>`).join('');
    select.value = state.categories.some(c=>c.id===old) ? old : 'all';
  }

  window.renderAll = function () {
    setMonthOptions($('monthPicker'));
    setMonthOptions($('budgetMonthPicker'));
    populateTransactionFilters();
    renderDashboard();
    renderTransactions();
    renderBudgets();
    renderCategories();
    updateLocalStatus();
  };

  function submitTransaction(e) {
    e.preventDefault();
    const label = $('txLabel').value.trim();
    const amount = Number($('txAmount').value);
    const date = $('txDate').value;
    const category = $('txCategory').value;
    const note = $('txNote').value.trim();

    if (!label || !Number.isFinite(amount) || amount <= 0 || !date || !category) {
      alert('Merci de remplir les champs obligatoires.');
      return;
    }

    if (editId) {
      const t = state.transactions.find(x => x.id === editId);
      if (t) Object.assign(t, {label, amount, date, category, note, type:currentType});
    } else {
      state.transactions.push({
        id: uid(), type: currentType, label, amount, date, category, note
      });
    }

    save();
    closeTxModal();
    renderAll();
    toast(editId ? 'Transaction modifiée' : 'Transaction enregistrée');
  }

  function wireEvents() {
    // Navigation: delegated listener works reliably on Safari/iOS.
    $('nav')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-page]');
      if (btn) navigate(btn.dataset.page);
    });

    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-page]');
      if (btn && !$('nav')?.contains(btn)) navigate(btn.dataset.page);
    });

    $('addBtn')?.addEventListener('click', () => openTxModal());
    $('quickExpense')?.addEventListener('click', () => openTxModal(null,'expense'));
    $('quickIncome')?.addEventListener('click', () => openTxModal(null,'income'));
    $('transactionsAdd')?.addEventListener('click', () => openTxModal());

    $('incomeToggle')?.addEventListener('click', () => setType('income'));
    $('expenseToggle')?.addEventListener('click', () => setType('expense'));

    $('closeModal')?.addEventListener('click', closeTxModal);
    $('cancelModal')?.addEventListener('click', closeTxModal);
    $('modalBackdrop')?.addEventListener('click', e => {
      if (e.target === $('modalBackdrop')) closeTxModal();
    });
    $('txForm')?.addEventListener('submit', submitTransaction);

    $('monthPicker')?.addEventListener('change', () => renderDashboard());
    $('budgetMonthPicker')?.addEventListener('change', () => renderBudgets());

    ['searchTx','typeFilter','catFilter','dateFrom','dateTo'].forEach(id => {
      $(id)?.addEventListener('input', renderTransactions);
      $(id)?.addEventListener('change', renderTransactions);
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        closeTxModal();
        $('categoryModal')?.classList.remove('open');
      }
      if (e.target.matches?.('input,textarea,select')) return;
      if (e.key.toLowerCase() === 'd') openTxModal(null,'expense');
      if (e.key.toLowerCase() === 'r') openTxModal(null,'income');
    });

    window.addEventListener('resize', () => {
      if (activePage === 'dashboard') renderDashboard();
    });
  }

  // Patch the existing inline code's initialization.
  // The original inline script calls renderAll before this file is reached;
  // that exception does not prevent this script from completing.
  wireEvents();

  // Make sure the dashboard is initialized once all functions exist.
  try {
    renderAll();
    updateLocalStatus();
  } catch (err) {
    console.error('FinanceApp initialization:', err);
  }
})();
