
import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import {
  Wallet, Home, ArrowLeftRight, Plus, ChartNoAxesCombined, Settings,
  TrendingUp, TrendingDown, Building2, Download, Upload, Trash2,
  X, Check, Pencil
} from 'lucide-react';
import {
  db, expenseCategories, incomeCategories, defaultAccounts,
  toPaise, fromPaise, type Transaction
} from './db';

type Tab = 'home' | 'transactions' | 'analytics' | 'settings';
type View = 'combined' | 'personal' | 'business';

const money = (n: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0
}).format(n);

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const COLORS = ['#438cf5', '#36ce91', '#ff6878', '#a78bfa', '#f5a623', '#22c1c3', '#e879f9'];

export default function App() {
  const [authUser, setAuthUser] = useState<{ phone: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authPhone, setAuthPhone] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    fetch('/.netlify/functions/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'me' })
    })
      .then(r => r.json())
      .then(d => setAuthUser(d.user || null))
      .catch(() => setAuthUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  const submitAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthBusy(true);

    try {
      const r = await fetch('/.netlify/functions/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: authMode === 'login' ? 'login' : 'register',
          phone: authPhone,
          password: authPassword
        })
      });

      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Unable to continue.');

      setAuthUser(d.user);
      setAuthPassword('');
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Connection error.');
    } finally {
      setAuthBusy(false);
    }
  };

  const logout = async () => {
    await fetch('/.netlify/functions/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' })
    });
    setAuthUser(null);
  };

  if (authLoading) {
    return <div className="auth-screen"><div className="auth-card">
      <div className="brand-icon"><Wallet size={22}/></div>
      <h1>HISAAB</h1><p>Loading your account…</p>
    </div></div>;
  }

  if (!authUser) {
    return <div className="auth-screen">
      <form className="auth-card" onSubmit={submitAuth}>
        <div className="brand-icon"><Wallet size={22}/></div>
        <h1>HISAAB</h1>
        <p>Personal & Business Finance</p>

        <div className="auth-tabs">
          <button type="button" className={authMode === 'login' ? 'active' : ''}
            onClick={() => { setAuthMode('login'); setAuthError(''); }}>Login</button>
          <button type="button" className={authMode === 'register' ? 'active' : ''}
            onClick={() => { setAuthMode('register'); setAuthError(''); }}>Register</button>
        </div>

        <label>Phone number
          <input className="field" type="tel" autoComplete="tel"
            placeholder="Enter phone number" value={authPhone}
            onChange={e => setAuthPhone(e.target.value)} required />
        </label>

        <label>Password
          <input className="field" type="password"
            autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
            placeholder="At least 6 characters" value={authPassword}
            onChange={e => setAuthPassword(e.target.value)}
            minLength={6} required />
        </label>

        {authError && <div className="auth-error">{authError}</div>}
        <button className="submit-button" disabled={authBusy}>
          {authBusy ? 'Please wait…' : authMode === 'login' ? 'Login' : 'Create account'}
        </button>
        <small>Each phone number has its own private HISAAB data.</small>
      </form>
    </div>;
  }

  return <FinanceApp user={authUser} onLogout={logout}/>;
}

function FinanceApp({ user, onLogout }: {
  user: { phone: string };
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<Tab>('home');
  const [view, setView] = useState<View>('combined');
  const [selectedBusiness, setSelectedBusiness] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [businesses, setBusinesses] = useState<{ id?: number; name: string }[]>([]);
  const [accounts, setAccounts] = useState<{ id?: number; name: string; kind: string; openingBalance: number }[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [formType, setFormType] = useState<'income' | 'expense'>('expense');
  const [filter, setFilter] = useState('all');
  const [monthRange, setMonthRange] = useState('12');
  const [businessName, setBusinessName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [notice, setNotice] = useState('');

  const saveCloud = async () => {
    const data = {
      transactions: await db.transactions.toArray(),
      businesses: await db.businesses.toArray(),
      accounts: await db.accounts.toArray()
    };

    const r = await fetch('/.netlify/functions/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!r.ok) throw new Error('Cloud save failed. Please check your connection.');
  };

  const refresh = async () => {
    const [tx, biz, acc] = await Promise.all([
      db.transactions.orderBy('date').reverse().toArray(),
      db.businesses.toArray(),
      db.accounts.toArray()
    ]);

    setTransactions(tx);
    setBusinesses(biz);
    setAccounts(acc);
  };

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch('/.netlify/functions/data');

        if (response.status === 401) {
          throw new Error('Your session expired. Please log in again.');
        }
        if (!response.ok) throw new Error('Could not load cloud data.');

        const cloud = await response.json();

        await db.transaction('rw', db.transactions, db.businesses, db.accounts, async () => {
          await db.transactions.clear();
          await db.businesses.clear();
          await db.accounts.clear();

          if (cloud.transactions?.length) {
            await db.transactions.bulkAdd(cloud.transactions.map((x: Transaction) => ({ ...x, id: undefined })));
          }
          if (cloud.businesses?.length) {
            await db.businesses.bulkAdd(cloud.businesses.map((x: { name: string; createdAt: string }) => ({ ...x, id: undefined })));
          }
          if (cloud.accounts?.length) {
            await db.accounts.bulkAdd(cloud.accounts.map((x: { name: string; kind: string; openingBalance: number; createdAt: string }) => ({ ...x, id: undefined })));
          }
        });
      } catch (e) {
        setNotice(e instanceof Error ? e.message : 'Cloud connection failed.');
      }

      const existing = await db.businesses.toArray();
      const existingNames = existing.map(b => b.name.toLowerCase());
      const missing = ['Library', 'School'].filter(n => !existingNames.includes(n.toLowerCase()));

      if (missing.length) {
        await db.businesses.bulkAdd(missing.map(name => ({
          name, createdAt: new Date().toISOString()
        })));
      }

      if ((await db.accounts.count()) === 0) {
        await db.accounts.bulkAdd(defaultAccounts.map(a => ({
          ...a, openingBalance: 0, createdAt: new Date().toISOString()
        })));
      }

      await refresh();
      await saveCloud();
    })().catch(() => setNotice('Could not initialise your HISAAB data.'));
  }, []);

  const visible = useMemo(() => transactions.filter(t => {
    if (view === 'personal' && t.scope !== 'personal') return false;
    if (view === 'business' && t.scope !== 'business') return false;
    if (view === 'business' && selectedBusiness && t.business !== selectedBusiness) return false;
    return true;
  }), [transactions, view, selectedBusiness]);

  const totals = useMemo(() => {
    const income = visible.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = visible.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    return {
      income: fromPaise(income),
      expense: fromPaise(expense),
      net: fromPaise(income - expense)
    };
  }, [visible]);

  const accountBalance = useMemo(() => {
    const opening = accounts.reduce((s, a) => s + a.openingBalance, 0);
    const movement = transactions.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
    return fromPaise(opening + movement);
  }, [accounts, transactions]);

  const monthData = useMemo(() => {
    const count = Number(monthRange);
    const now = new Date();
    const months: {
      key: string; label: string; balance: number; income: number;
      expense: number; opening: number; closing: number
    }[] = [];

    const first = new Date(now.getFullYear(), now.getMonth() - count + 1, 1);
    let cumulative = accounts.reduce((s, a) => s + a.openingBalance, 0);
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
    const start = new Date(first.getFullYear(), first.getMonth(), 1);

    cumulative += sorted.filter(t => new Date(`${t.date}T00:00:00`) < start)
      .reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);

    for (let i = 0; i < count; i++) {
      const d = new Date(first.getFullYear(), first.getMonth() + i, 1);
      const key = monthKey(d);
      const monthTx = sorted.filter(t => t.date.slice(0, 7) === key);
      const opening = cumulative;
      const income = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const expense = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      cumulative += income - expense;

      months.push({
        key,
        label: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
        balance: fromPaise(cumulative),
        income: fromPaise(income),
        expense: fromPaise(expense),
        opening: fromPaise(opening),
        closing: fromPaise(cumulative)
      });
    }

    return months;
  }, [transactions, accounts, monthRange]);

  const categoryData = useMemo(() => {
    const sums = new Map<string, number>();
    visible.filter(t => t.type === 'expense').forEach(t => {
      sums.set(t.category, (sums.get(t.category) || 0) + t.amount);
    });
    return [...sums.entries()].map(([name, amount]) => ({
      name, value: fromPaise(amount)
    }));
  }, [visible]);

  const filteredTx = transactions
    .filter(t => filter === 'all' || t.type === filter)
    .filter(t => view === 'combined' || (view === 'personal'
      ? t.scope === 'personal' : t.scope === 'business'))
    .filter(t => view !== 'business' || !selectedBusiness || t.business === selectedBusiness);

  const addTransaction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const f = new FormData(e.currentTarget);
    const amount = Number(f.get('amount'));
    const scope = String(f.get('scope')) as 'personal' | 'business';
    const business = String(f.get('business') || '');

    if (!amount || amount <= 0) {
      setNotice('Enter a valid amount.');
      return;
    }
    if (scope === 'business' && !business) {
      setNotice('Select a business.');
      return;
    }

    const tx: Transaction = {
      ...(editingTx || {}),
      type: formType,
      amount: toPaise(amount),
      date: String(f.get('date') || today()),
      category: String(f.get('category')),
      scope,
      business: scope === 'business' ? business : undefined,
      account: String(f.get('account')),
      description: String(f.get('description') || ''),
      notes: String(f.get('notes') || ''),
      createdAt: editingTx?.createdAt || new Date().toISOString()
    };

    try {
      if (editingTx?.id) await db.transactions.update(editingTx.id, tx);
      else await db.transactions.add(tx);

      await saveCloud();
      await refresh();
      setShowForm(false);
      setEditingTx(null);
      setNotice(editingTx ? 'Transaction updated successfully.' : 'Transaction saved successfully.');
    } catch {
      setNotice('Could not save transaction. Please try again.');
    }
  };

  const editTx = (tx: Transaction) => {
    setEditingTx(tx);
    setFormType(tx.type);
    setShowForm(true);
  };

  const deleteTx = async (id?: number) => {
    if (!id || !confirm('Delete this transaction?')) return;

    try {
      await db.transactions.delete(id);
      await saveCloud();
      await refresh();
      setNotice('Transaction deleted.');
    } catch {
      setNotice('Could not delete transaction.');
    }
  };

  const addBusiness = async () => {
    const name = businessName.trim();

    if (!name) return;
    if (businesses.some(b => b.name.toLowerCase() === name.toLowerCase())) {
      setNotice('This business already exists.');
      return;
    }

    try {
      await db.businesses.add({ name, createdAt: new Date().toISOString() });
      await saveCloud();
      setBusinessName('');
      await refresh();
      setNotice(`${name} added successfully.`);
    } catch {
      setNotice('Could not add business.');
    }
  };

  const addAccount = async () => {
    const name = accountName.trim();
    if (!name) return;

    try {
      await db.accounts.add({
        name, kind: 'Other', openingBalance: 0,
        createdAt: new Date().toISOString()
      });
      await saveCloud();
      setAccountName('');
      await refresh();
      setNotice('Account added.');
    } catch {
      setNotice('Could not add account.');
    }
  };

  const exportBackup = async () => {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      transactions: await db.transactions.toArray(),
      businesses: await db.businesses.toArray(),
      accounts: await db.accounts.toArray()
    };
    downloadFile(JSON.stringify(data, null, 2), 'hisaab-backup.json', 'application/json');
  };

  const importBackup = async (file?: File) => {
    if (!file) return;

    try {
      const data = JSON.parse(await file.text());

      if (!Array.isArray(data.transactions) ||
          !Array.isArray(data.businesses) ||
          !Array.isArray(data.accounts)) {
        throw new Error('Invalid backup format');
      }

      if (!confirm('Replace the current data with this backup?')) return;

      await db.transaction('rw', db.transactions, db.businesses, db.accounts, async () => {
        await db.transactions.clear();
        await db.businesses.clear();
        await db.accounts.clear();

        await db.transactions.bulkAdd(data.transactions.map((x: Transaction) => ({ ...x, id: undefined })));
        await db.businesses.bulkAdd(data.businesses.map((x: { name: string; createdAt: string }) => ({ ...x, id: undefined })));
        await db.accounts.bulkAdd(data.accounts.map((x: { name: string; kind: string; openingBalance: number; createdAt: string }) => ({ ...x, id: undefined })));
      });

      await saveCloud();
      await refresh();
      setNotice('Backup restored successfully.');
    } catch {
      setNotice('Could not restore this backup file.');
    }
  };

  const exportCSV = () => {
    const rows = [
      ['Date', 'Type', 'Amount INR', 'Scope', 'Business', 'Category', 'Account', 'Description'],
      ...transactions.map(t => [
        t.date, t.type, fromPaise(t.amount).toFixed(2), t.scope,
        t.business || '', t.category, t.account, t.description
      ])
    ];

    const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n');
    downloadFile(csv, 'hisaab-transactions.csv', 'text/csv');
  };

  const openNewTransaction = () => {
    setEditingTx(null);
    setFormType('expense');
    setShowForm(true);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon"><Wallet size={22}/></div>
          <div><strong>HISAAB</strong><small>PERSONAL & BUSINESS FINANCE</small></div>
        </div>

        <div className="header-user">
          <span className="user-phone">{user.phone}</span>
          <span className="currency-pill">₹ INR</span>
          <button className="logout-button" onClick={onLogout}>↪ Logout</button>
        </div>
      </header>

      <main className="content">
        <nav className="top-navigation">
          <NavButton active={tab === 'home'} icon={<Home/>} label="Home" onClick={() => setTab('home')}/>
          <NavButton active={tab === 'transactions'} icon={<ArrowLeftRight/>} label="Activity" onClick={() => setTab('transactions')}/>
          <button className="add-nav" onClick={openNewTransaction} aria-label="Add transaction"><Plus size={24}/></button>
          <NavButton active={tab === 'analytics'} icon={<ChartNoAxesCombined/>} label="Analytics" onClick={() => setTab('analytics')}/>
          <NavButton active={tab === 'settings'} icon={<Settings/>} label="Settings" onClick={() => setTab('settings')}/>
        </nav>

        <div className="view-switch">
          {(['combined', 'personal', 'business'] as View[]).map(v =>
            <button key={v} className={view === v ? 'selected' : ''}
              onClick={() => setView(v)}>
              {v === 'combined' ? 'Combined' : v === 'personal' ? 'Personal' : 'Business'}
            </button>
          )}
        </div>

        {view === 'business' && (
          <select className="field business-filter" value={selectedBusiness}
            onChange={e => setSelectedBusiness(e.target.value)}>
            <option value="">All businesses</option>
            {businesses.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
          </select>
        )}

        {tab === 'home' && <>
          <section className="balance-card">
            <div className="eyebrow">TOTAL AVAILABLE BALANCE</div>
            <div className="balance-value">{money(accountBalance)}</div>
            <div className="balance-note"><span className="live-dot"/> Cloud synced · INR</div>
          </section>

          <section className="stats-grid">
            <Stat icon={<TrendingUp/>} label="Total Income" value={money(totals.income)} kind="income"/>
            <Stat icon={<TrendingDown/>} label="Total Expenses" value={money(totals.expense)} kind="expense"/>
            <Stat icon={<Wallet/>} label="Net Cash Flow" value={money(totals.net)} kind={totals.net >= 0 ? 'income' : 'expense'}/>
            <Stat icon={<Building2/>} label="Businesses" value={String(businesses.length)} kind="blue"/>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div><h2>Balance History</h2><p>Your month-by-month closing balance</p></div>
              <select className="mini-select" value={monthRange}
                onChange={e => setMonthRange(e.target.value)}>
                <option value="6">6 Months</option>
                <option value="12">12 Months</option>