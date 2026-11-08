import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import {
  Wallet, Home, ArrowLeftRight, Plus, ChartNoAxesCombined, Settings,
  TrendingUp, TrendingDown, Building2, Download, Upload, Trash2,
  X, Check, Pencil, LogOut
} from 'lucide-react';
import {
  db, expenseCategories, incomeCategories, defaultAccounts,
  toPaise, fromPaise, type Transaction
} from './db';

type Tab = 'home' | 'transactions' | 'analytics' | 'settings';
type View = 'combined' | 'personal' | 'business';
type Business = { id?: number; name: string; createdAt?: string };
type Account = {
  id?: number;
  name: string;
  kind: string;
  openingBalance: number;
  createdAt?: string;
};

const money = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(n);

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

const COLORS = [
  '#438cf5', '#36ce91', '#ff6878', '#a78bfa',
  '#f5a623', '#22c1c3', '#e879f9'
];

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Login check failed.');
        setAuthUser(data.user || null);
      })
      .catch(() => setAuthUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  const submitAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthBusy(true);

    try {
      const response = await fetch('/.netlify/functions/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: authMode,
          phone: authPhone,
          password: authPassword
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to continue.');

      setAuthUser(data.user);
      setAuthPassword('');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Connection error.');
    } finally {
      setAuthBusy(false);
    }
  };

  const logout = async () => {
    try {
      await fetch('/.netlify/functions/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' })
      });
    } finally {
      await db.transaction(
        'rw',
        db.transactions,
        db.businesses,
        db.accounts,
        async () => {
          await db.transactions.clear();
          await db.businesses.clear();
          await db.accounts.clear();
        }
      );
      setAuthUser(null);
    }
  };

  if (authLoading) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="brand-icon"><Wallet size={22} /></div>
          <h1>HISAAB</h1>
          <p>Loading your account...</p>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="auth-screen">
        <form className="auth-card" onSubmit={submitAuth}>
          <div className="brand-icon"><Wallet size={22} /></div>
          <h1>HISAAB</h1>
          <p>Personal &amp; Business Finance</p>

          <div className="auth-tabs">
            <button
              type="button"
              className={authMode === 'login' ? 'active' : ''}
              onClick={() => {
                setAuthMode('login');
                setAuthError('');
              }}
            >
              Login
            </button>
            <button
              type="button"
              className={authMode === 'register' ? 'active' : ''}
              onClick={() => {
                setAuthMode('register');
                setAuthError('');
              }}
            >
              Register
            </button>
          </div>

          <label>
            Phone number
            <input
              className="field"
              type="tel"
              placeholder="Enter phone number"
              value={authPhone}
              onChange={e => setAuthPhone(e.target.value)}
              required
            />
          </label>

          <label>
            Password
            <input
              className="field"
              type="password"
              placeholder="At least 6 characters"
              value={authPassword}
              onChange={e => setAuthPassword(e.target.value)}
              minLength={6}
              required
            />
          </label>

          {authError && <div className="auth-error">{authError}</div>}

          <button className="submit-button" disabled={authBusy}>
            {authBusy
              ? 'Please wait...'
              : authMode === 'login'
                ? 'Login'
                : 'Create account'}
          </button>

          <small>Each phone number has its own private HISAAB data.</small>
        </form>
      </div>
    );
  }

  return <FinanceApp user={authUser} onLogout={logout} />;
}

function FinanceApp({
  user,
  onLogout
}: {
  user: { phone: string };
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<Tab>('home');
  const [view, setView] = useState<View>('combined');
  const [selectedBusiness, setSelectedBusiness] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState('');
  const [notice, setNotice] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [formType, setFormType] = useState<'income' | 'expense'>('expense');
  const [filter, setFilter] = useState('all');
  const [monthRange, setMonthRange] = useState('12');

  const [businessName, setBusinessName] = useState('');
  const [editingBusiness, setEditingBusiness] = useState<number | null>(null);
  const [editingBusinessName, setEditingBusinessName] = useState('');
  const [accountName, setAccountName] = useState('');

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

  const saveCloud = async () => {
    const data = {
      transactions: await db.transactions.toArray(),
      businesses: await db.businesses.toArray(),
      accounts: await db.accounts.toArray()
    };

    const response = await fetch('/.netlify/functions/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.status === 401) {
      throw new Error('Your session has expired. Please log in again.');
    }
    if (!response.ok) {
      throw new Error('Cloud save failed. Please check your connection.');
    }
  };

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const response = await fetch('/.netlify/functions/data');

        if (response.status === 401) {
          throw new Error('Session expired. Please log in again.');
        }
        if (!response.ok) {
          throw new Error('Could not load cloud data. Please refresh.');
        }

        const cloud = await response.json();

        if (
          !Array.isArray(cloud.transactions) ||
          !Array.isArray(cloud.businesses) ||
          !Array.isArray(cloud.accounts)
        ) {
          throw new Error('Cloud data format is invalid.');
        }

        if (!active) return;

        await db.transaction(
          'rw',
          db.transactions,
          db.businesses,
          db.accounts,
          async () => {
            await db.transactions.clear();
            await db.businesses.clear();
            await db.accounts.clear();

            if (cloud.transactions.length) {
              await db.transactions.bulkAdd(
                cloud.transactions.map((item: Transaction) => {
                  const { id: _id, ...rest } = item;
                  return rest;
                })
              );
            }

            if (cloud.businesses.length) {
              await db.businesses.bulkAdd(
                cloud.businesses.map((item: Business) => {
                  const { id: _id, ...rest } = item;
                  return rest;
                })
              );
            }

            if (cloud.accounts.length) {
              await db.accounts.bulkAdd(
                cloud.accounts.map((item: Account) => {
                  const { id: _id, ...rest } = item;
                  return rest;
                })
              );
            }
          }
        );

        const currentBusinesses = await db.businesses.toArray();
        const names = currentBusinesses.map(b => b.name.toLowerCase());
        const missing = ['Library', 'School'].filter(
          name => !names.includes(name.toLowerCase())
        );

        if (missing.length) {
          await db.businesses.bulkAdd(
            missing.map(name => ({
              name,
              createdAt: new Date().toISOString()
            }))
          );
        }

        if ((await db.accounts.count()) === 0) {
          await db.accounts.bulkAdd(
            defaultAccounts.map(account => ({
              ...account,
              openingBalance: 0,
              createdAt: new Date().toISOString()
            }))
          );
        }

        await refresh();
        await saveCloud();

        if (active) setDataError('');
      } catch (error) {
        if (active) {
          setDataError(
            error instanceof Error ? error.message : 'Cloud connection failed.'
          );
        }
      } finally {
        if (active) setDataLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const visible = useMemo(
    () =>
      transactions.filter(transaction => {
        if (view === 'personal' && transaction.scope !== 'personal') return false;
        if (view === 'business' && transaction.scope !== 'business') return false;
        if (
          view === 'business' &&
          selectedBusiness &&
          transaction.business !== selectedBusiness
        ) return false;
        return true;
      }),
    [transactions, view, selectedBusiness]
  );

  const totals = useMemo(() => {
    const income = visible
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const expense = visible
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      income: fromPaise(income),
      expense: fromPaise(expense),
      net: fromPaise(income - expense)
    };
  }, [visible]);

  const accountBalance = useMemo(() => {
    const opening = accounts.reduce((sum, account) => sum + account.openingBalance, 0);
    const movement = transactions.reduce(
      (sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount),
      0
    );
    return fromPaise(opening + movement);
  }, [accounts, transactions]);

  const monthData = useMemo(() => {
    const count = Number(monthRange);
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() - count + 1, 1);
    const sorted = [...visible].sort((a, b) => a.date.localeCompare(b.date));

    let cumulative = accounts.reduce(
      (sum, account) => sum + account.openingBalance,
      0
    );

    cumulative += sorted
      .filter(t => new Date(`${t.date}T00:00:00`) < first)
      .reduce(
        (sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount),
        0
      );

    const months: {
      key: string;
      label: string;
      balance: number;
      income: number;
      expense: number;
    }[] = [];

    for (let i = 0; i < count; i++) {
      const date = new Date(first.getFullYear(), first.getMonth() + i, 1);
      const key = monthKey(date);
      const monthTransactions = sorted.filter(t => t.date.slice(0, 7) === key);

      const income = monthTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);

      const expense = monthTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

      cumulative += income - expense;

      months.push({
        key,
        label: date.toLocaleDateString('en-IN', {
          month: 'short',
          year: '2-digit'
        }),
        balance: fromPaise(cumulative),
        income: fromPaise(income),
        expense: fromPaise(expense)
      });
    }

    return months;
  }, [visible, accounts, monthRange]);

  const categoryData = useMemo(() => {
    const sums = new Map<string, number>();

    visible.filter(t => t.type === 'expense').forEach(t => {
      sums.set(t.category, (sums.get(t.category) || 0) + t.amount);
    });

    return [...sums.entries()].map(([name, amount]) => ({
      name,
      value: fromPaise(amount)
    }));
  }, [visible]);

  const filteredTx = transactions
    .filter(t => filter === 'all' || t.type === filter)
    .filter(t =>
      view === 'combined' ||
      (view === 'personal' ? t.scope === 'personal' : t.scope === 'business')
    )
    .filter(
      t => view !== 'business' || !selectedBusiness || t.business === selectedBusiness
    );

  const addTransaction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const form = new FormData(e.currentTarget);
    const amount = Number(form.get('amount'));
    const scope = String(form.get('scope')) as 'personal' | 'business';
    const business = String(form.get('business') || '');

    if (!amount || amount <= 0) {
      setNotice('Enter a valid amount.');
      return;
    }

    if (scope === 'business' && !business) {
      setNotice('Please select a business.');
      return;
    }

    const transaction: Transaction = {
      ...(editingTx || {}),
      type: formType,
      amount: toPaise(amount),
      date: String(form.get('date') || today()),
      category: String(form.get('category')),
      scope,
      business: scope === 'business' ? business : undefined,
      account: String(form.get('account')),
      description: String(form.get('description') || ''),
      notes: String(form.get('notes') || ''),
      createdAt: editingTx?.createdAt || new Date().toISOString()
    };

    try {
      if (editingTx?.id) {
        await db.transactions.update(editingTx.id, transaction);
      } else {
        await db.transactions.add(transaction);
      }

      await saveCloud();
      await refresh();
      setShowForm(false);
      setEditingTx(null);
      setNotice(editingTx ? 'Transaction updated.' : 'Transaction saved.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save transaction.');
    }
  };

  const openNewTransaction = () => {
    setEditingTx(null);
    setFormType('expense');
    setShowForm(true);
  };

  const editTx = (transaction: Transaction) => {
    setEditingTx(transaction);
    setFormType(transaction.type);
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

    if (!name) {
      setNotice('Enter a business name.');
      return;
    }

    if (businesses.some(b => b.name.toLowerCase() === name.toLowerCase())) {
      setNotice('This business already exists.');
      return;
    }

    try {
      await db.businesses.add({
        name,
        createdAt: new Date().toISOString()
      });
      await saveCloud();
      setBusinessName('');
      await refresh();
      setNotice(`${name} added successfully.`);
    } catch {
      setNotice('Could not add business.');
    }
  };

  const startBusinessEdit = (business: Business) => {
    if (!business.id) return;
    setEditingBusiness(business.id);
    setEditingBusinessName(business.name);
  };

  const saveBusinessEdit = async () => {
    const name = editingBusinessName.trim();

    if (!name || editingBusiness === null) return;

    if (
      businesses.some(
        b =>
          b.id !== editingBusiness &&
          b.name.toLowerCase() === name.toLowerCase()
      )
    ) {
      setNotice('A business with this name already exists.');
      return;
    }

    const oldBusiness = businesses.find(b => b.id === editingBusiness);
    if (!oldBusiness) return;

    try {
      await db.transaction(
        'rw',
        db.businesses,
        db.transactions,
        async () => {
          await db.businesses.update(editingBusiness, { name });

          const linkedTransactions = await db.transactions
            .where('business')
            .equals(oldBusiness.name)
            .toArray();

          for (const transaction of linkedTransactions) {
            if (transaction.id) {
              await db.transactions.update(transaction.id, {
                business: name
              });
            }
          }
        }
      );

      await saveCloud();
      await refresh();

      if (selectedBusiness === oldBusiness.name) {
        setSelectedBusiness(name);
      }

      setEditingBusiness(null);
      setEditingBusinessName('');
      setNotice('Business name updated.');
    } catch {
      setNotice('Could not update business.');
    }
  };

  const deleteBusiness = async (business: Business) => {
    if (!business.id) return;

    const linked = transactions.filter(
      t => t.scope === 'business' && t.business === business.name
    );

    if (linked.length > 0) {
      setNotice(
        `Cannot delete ${business.name}: it has linked transactions. Rename it instead.`
      );
      return;
    }

    if (!confirm(`Delete "${business.name}"?`)) return;

    try {
      await db.businesses.delete(business.id);
      await saveCloud();
      await refresh();

      if (selectedBusiness === business.name) {
        setSelectedBusiness('');
      }

      setNotice(`${business.name} deleted.`);
    } catch {
      setNotice('Could not delete business.');
    }
  };

  const addAccount = async () => {
    const name = accountName.trim();

    if (!name) return;

    if (accounts.some(a => a.name.toLowerCase() === name.toLowerCase())) {
      setNotice('This account already exists.');
      return;
    }

    try {
      await db.accounts.add({
        name,
        kind: 'Other',
        openingBalance: 0,
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

    downloadFile(
      JSON.stringify(data, null, 2),
      'hisaab-backup.json',
      'application/json'
    );
  };

  const importBackup = async (file?: File) => {
    if (!file) return;

    try {
      const data = JSON.parse(await file.text());

      if (
        !Array.isArray(data.transactions) ||
        !Array.isArray(data.businesses) ||
        !Array.isArray(data.accounts)
      ) {
        throw new Error('Invalid backup format.');
      }

      if (!confirm('Replace current data with this backup?')) return;

      await db.transaction(
        'rw',
        db.transactions,
        db.businesses,
        db.accounts,
        async () => {
          await db.transactions.clear();
          await db.businesses.clear();
          await db.accounts.clear();

          await db.transactions.bulkAdd(
            data.transactions.map((item: Transaction) => {
              const { id: _id, ...rest } = item;
              return rest;
            })
          );

          await db.businesses.bulkAdd(
            data.businesses.map((item: Business) => {
              const { id: _id, ...rest } = item;
              return rest;
            })
          );

          await db.accounts.bulkAdd(
            data.accounts.map((item: Account) => {
              const { id: _id, ...rest } = item;
              return rest;
            })
          );
        }
      );

      await saveCloud();
      await refresh();
      setNotice('Backup restored successfully.');
    } catch {
      setNotice('Could not restore backup.');
    }
  };

  const exportCSV = () => {
    const rows = [
      [
        'Date',
        'Type',
        'Amount INR',
        'Scope',
        'Business',
        'Category',
        'Account',
        'Description'
      ],
      ...transactions.map(t => [
        t.date,
        t.type,
        fromPaise(t.amount).toFixed(2),
        t.scope,
        t.business || '',
        t.category,
        t.account,
        t.description
      ])
    ];

    const csv = rows
      .map(row =>
        row
          .map(value => `"${String(value).replaceAll('"', '""')}"`)
          .join(',')
      )
      .join('\n');

    downloadFile(csv, 'hisaab-transactions.csv', 'text/csv');
  };

  if (dataLoading) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="brand-icon"><Wallet size={22} /></div>
          <h1>HISAAB</h1>
          <p>Loading your financial data...</p>
        </div>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="brand-icon"><Wallet size={22} /></div>
          <h1>HISAAB</h1>
          <div className="auth-error">{dataError}</div>
          <button
            className="submit-button"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
          <button className="secondary-button" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon"><Wallet size={22} /></div>
          <div>
            <strong>HISAAB</strong>
            <small>PERSONAL &amp; BUSINESS FINANCE</small>
          </div>
        </div>

        <div className="header-user">
          <span className="user-phone">{user.phone}</span>
          <span className="currency-pill">₹ INR</span>
          <button className="logout-button" onClick={onLogout}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </header>

      <main className="content">
        <nav className="top-navigation">
          <NavButton
            active={tab === 'home'}
            icon={<Home size={19} />}
            label="Home"
            onClick={() => setTab('home')}
          />
          <NavButton
            active={tab === 'transactions'}
            icon={<ArrowLeftRight size={19} />}
            label="Activity"
            onClick={() => setTab('transactions')}
          />
          <button
            className="add-nav"
            onClick={openNewTransaction}
            aria-label="Add transaction"
          >
            <Plus size={24} />
          </button>
          <NavButton
            active={tab === 'analytics'}
            icon={<ChartNoAxesCombined size={19} />}
            label="Analytics"
            onClick={() => setTab('analytics')}
          />
          <NavButton
            active={tab === 'settings'}
            icon={<Settings size={19} />}
            label="Settings"
            onClick={() => setTab('settings')}
          />
        </nav>

        <div className="view-switch">
          {(['combined', 'personal', 'business'] as View[]).map(item => (
            <button
              key={item}
              className={view === item ? 'selected' : ''}
              onClick={() => setView(item)}
            >
              {item === 'combined'
                ? 'Combined'
                : item === 'personal'
                  ? 'Personal'
                  : 'Business'}
            </button>
          ))}
        </div>

        {view === 'business' && (
          <select
            className="field business-filter"
            value={selectedBusiness}
            onChange={e => setSelectedBusiness(e.target.value)}
          >
            <option value="">All businesses</option>
            {businesses.map(business => (
              <option key={business.id} value={business.name}>
                {business.name}
              </option>
            ))}
          </select>
        )}

        {tab === 'home' && (
          <>
            <section className="balance-card">
              <div className="eyebrow">TOTAL AVAILABLE BALANCE</div>
              <div className="balance-value">{money(accountBalance)}</div>
              <div className="balance-note">
                <span className="live-dot" /> Cloud synced · INR
              </div>
            </section>

            <section className="stats-grid">
              <Stat
                icon={<TrendingUp />}
                label="Total Income"
                value={money(totals.income)}
                kind="income"
              />
              <Stat
                icon={<TrendingDown />}
                label="Total Expenses"
                value={money(totals.expense)}
                kind="expense"
              />
              <Stat
                icon={<Wallet />}
                label="Net Cash Flow"
                value={money(totals.net)}
                kind={totals.net >= 0 ? 'income' : 'expense'}
              />
              <Stat
                icon={<Building2 />}
                label="Businesses"
                value={String(businesses.length)}
                kind="blue"
              />
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Balance History</h2>
                  <p>Your month-by-month closing balance</p>
                </div>
                <select
                  className="mini-select"
                  value={monthRange}
                  onChange={e => setMonthRange(e.target.value)}
                >
                  <option value="6">6 Months</option>
                  <option value="12">12 Months</option>
                  <option value="24">24 Months</option>
                </select>
              </div>

              <div className="chart-area">
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={monthData}>
                    <defs>
                      <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#438cf5" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#438cf5" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#263449" />
                    <XAxis dataKey="label" stroke="#8290a5" />
                    <YAxis stroke="#8290a5" />
                    <Tooltip formatter={(value) => money(Number(value ?? 0))} />
                    <Area
                      type="monotone"
                      dataKey="balance"
                      stroke="#438cf5"
                      fill="url(#balanceGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Recent Transactions</h2>
                  <p>Your latest financial activity</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => setTab('transactions')}
                >
                  View all
                </button>
              </div>

              <TransactionList
                items={filteredTx.slice(0, 5)}
                onEdit={editTx}
                onDelete={deleteTx}
              />
            </section>
          </>
        )}

        {tab === 'transactions' && (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Transactions</h2>
                <p>View, edit and manage your records</p>
              </div>
              <button className="primary-button" onClick={openNewTransaction}>
                <Plus size={16} /> Add New
              </button>
            </div>

            <div className="filter-row">
              <select
                className="mini-select"
                value={filter}
                onChange={e => setFilter(e.target.value)}
              >
                <option value="all">All transactions</option>
                <option value="income">Income only</option>
                <option value="expense">Expenses only</option>
              </select>
            </div>

            <TransactionList
              items={filteredTx}
              onEdit={editTx}
              onDelete={deleteTx}
            />
          </section>
        )}

        {tab === 'analytics' && (
          <>
            <section className="stats-grid">
              <Stat
                icon={<TrendingUp />}
                label="Income"
                value={money(totals.income)}
                kind="income"
              />
              <Stat
                icon={<TrendingDown />}
                label="Expenses"
                value={money(totals.expense)}
                kind="expense"
              />
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Income vs Expenses</h2>
                  <p>Monthly comparison</p>
                </div>
              </div>
              <div className="chart-area">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={monthData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#263449" />
                    <XAxis dataKey="label" stroke="#8290a5" />
                    <YAxis stroke="#8290a5" />
                    <Tooltip formatter={(value) => money(Number(value ?? 0))} />
                    <Bar dataKey="income" fill="#36ce91" radius={[5, 5, 0, 0]} />
                    <Bar dataKey="expense" fill="#ff6878" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Expense Categories</h2>
                  <p>Where your money is being spent</p>
                </div>
              </div>

              {categoryData.length === 0 ? (
                <p className="empty-state">No expense data available yet.</p>
              ) : (
                <div className="chart-area">
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={categoryData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={95}
                        label
                      >
                        {categoryData.map((entry, index) => (
                          <Cell
                            key={entry.name}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => money(Number(value ?? 0))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>
          </>
        )}

        {tab === 'settings' && (
          <>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Manage Businesses</h2>
                  <p>Add, rename or manage your businesses</p>
                </div>
                <Building2 size={22} />
              </div>

              <div className="business-add-row">
                <input
                  className="field"
                  placeholder="Enter new business name"
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void addBusiness();
                    }
                  }}
                />
                <button className="primary-button" onClick={addBusiness}>
                  <Plus size={17} /> Add
                </button>
              </div>

              <div className="business-list">
                {businesses.map(business => (
                  <div className="business-item" key={business.id}>
                    {editingBusiness === business.id ? (
                      <>
                        <input
                          className="field"
                          value={editingBusinessName}
                          onChange={e => setEditingBusinessName(e.target.value)}
                          autoFocus
                        />
                        <button
                          className="icon-button success"
                          onClick={saveBusinessEdit}
                          aria-label="Save business name"
                        >
                          <Check size={18} />
                        </button>
                        <button
                          className="icon-button"
                          onClick={() => {
                            setEditingBusiness(null);
                            setEditingBusinessName('');
                          }}
                          aria-label="Cancel editing"
                        >
                          <X size={18} />
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="business-item-name">
                          <Building2 size={17} />
                          <span>{business.name}</span>
                        </div>
                        <button
                          className="icon-button"
                          onClick={() => startBusinessEdit(business)}
                          aria-label={`Edit ${business.name}`}
                        >
                          <Pencil size={17} />
                        </button>
                        <button
                          className="icon-button danger"
                          onClick={() => deleteBusiness(business)}
                          aria-label={`Delete ${business.name}`}
                        >
                          <Trash2 size={17} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Manage Accounts</h2>
                  <p>Add your cash or bank accounts</p>
                </div>
                <Wallet size={22} />
              </div>

              <div className="business-add-row">
                <input
                  className="field"
                  placeholder="Enter account name"
                  value={accountName}
                  onChange={e => setAccountName(e.target.value)}
                />
                <button className="primary-button" onClick={addAccount}>
                  <Plus size={17} /> Add
                </button>
              </div>

              <div className="business-list">
                {accounts.map(account => (
                  <div className="business-item" key={account.id}>
                    <div className="business-item-name">
                      <Wallet size={17} />
                      <span>{account.name}</span>
                    </div>
                    <span className="account-kind">{account.kind}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Backup &amp; Export</h2>
                  <p>Keep a copy of your financial records</p>
                </div>
              </div>

              <div className="settings-actions">
                <button className="secondary-button" onClick={exportBackup}>
                  <Download size={17} /> Download Backup
                </button>

                <label className="secondary-button file-label">
                  <Upload size={17} /> Restore Backup
                  <input
                    type="file"
                    accept="application/json,.json"
                    hidden
                    onChange={e => {
                      void importBackup(e.target.files?.[0]);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>

                <button className="secondary-button" onClick={exportCSV}>
                  <Download size={17} /> Export Transactions CSV
                </button>
              </div>
            </section>
          </>
        )}

        {notice && (
          <div className="notice-message">
            <span>{notice}</span>
            <button onClick={() => setNotice('')} aria-label="Dismiss message">
              <X size={16} />
            </button>
          </div>
        )}
      </main>

      {showForm && (
        <TransactionModal
          editingTx={editingTx}
          formType={formType}
          setFormType={setFormType}
          businesses={businesses}
          accounts={accounts}
          onClose={() => {
            setShowForm(false);
            setEditingTx(null);
          }}
          onSubmit={addTransaction}
        />
      )}
    </div>
  );
}

function NavButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`nav-button ${active ? 'active' : ''}`}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Stat({
  icon,
  label,
  value,
  kind
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  kind: string;
}) {
  return (
    <div className={`stat-card ${kind}`}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function TransactionList({
  items,
  onEdit,
  onDelete
}: {
  items: Transaction[];
  onEdit: (transaction: Transaction) => void;
  onDelete: (id?: number) => void;
}) {
  if (items.length === 0) {
    return <p className="empty-state">No transactions found.</p>;
  }

  return (
    <div className="transaction-list">
      {items.map(transaction => (
        <div className="transaction-item" key={transaction.id}>
          <div className={`transaction-icon ${transaction.type}`}>
            {transaction.type === 'income'
              ? <TrendingUp size={19} />
              : <TrendingDown size={19} />}
          </div>

          <div className="transaction-details">
            <strong>{transaction.description || transaction.category}</strong>
            <small>
              {transaction.date} · {transaction.category}
              {transaction.scope === 'business' && transaction.business
                ? ` · ${transaction.business}`
                : ' · Personal'}
            </small>
          </div>

          <div className={`transaction-amount ${transaction.type}`}>
            {transaction.type === 'income' ? '+' : '-'}
            {money(fromPaise(transaction.amount))}
          </div>

          <div className="transaction-actions">
            <button
              className="icon-button"
              onClick={() => onEdit(transaction)}
              aria-label="Edit transaction"
            >
              <Pencil size={16} />
            </button>
            <button
              className="icon-button danger"
              onClick={() => onDelete(transaction.id)}
              aria-label="Delete transaction"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function TransactionModal({
  editingTx,
  formType,
  setFormType,
  businesses,
  accounts,
  onClose,
  onSubmit
}: {
  editingTx: Transaction | null;
  formType: 'income' | 'expense';
  setFormType: (type: 'income' | 'expense') => void;
  businesses: Business[];
  accounts: Account[];
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  const [scope, setScope] = useState<'personal' | 'business'>(
    editingTx?.scope || 'personal'
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="transaction-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <h2>{editingTx ? 'Edit Transaction' : 'Add Transaction'}</h2>
            <p>Enter your financial details</p>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div className="type-switch">
            <button
              type="button"
              className={formType === 'expense' ? 'selected expense' : ''}
              onClick={() => setFormType('expense')}
            >
              Expense
            </button>
            <button
              type="button"
              className={formType === 'income' ? 'selected income' : ''}
              onClick={() => setFormType('income')}
            >
              Income
            </button>
          </div>

          <label>
            Amount (₹)
            <input
              className="field"
              type="number"
              name="amount"
              min="0.01"
              step="0.01"
              defaultValue={
                editingTx ? fromPaise(editingTx.amount) : ''
              }
              placeholder="Enter amount"
              required
            />
          </label>

          <label>
            Date
            <input
              className="field"
              type="date"
              name="date"
              defaultValue={editingTx?.date || today()}
              required
            />
          </label>

          <label>
            Category
            <select
              className="field"
              name="category"
              defaultValue={
                editingTx?.category ||
                (formType === 'expense'
                  ? expenseCategories[0]
                  : incomeCategories[0])
              }
              key={`${formType}-${editingTx?.id || 'new'}`}
              required
            >
              {(formType === 'expense'
                ? expenseCategories
                : incomeCategories
              ).map(category => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label>
            Transaction type
            <select
              className="field"
              name="scope"
              value={scope}
              onChange={e =>
                setScope(e.target.value as 'personal' | 'business')
              }
            >
              <option value="personal">Personal</option>
              <option value="business">Business</option>
            </select>
          </label>

          {scope === 'business' && (
            <label>
              Select business
              <select
                className="field"
                name="business"
                defaultValue={editingTx?.business || ''}
                required
              >
                <option value="">Choose a business</option>
                {businesses.map(business => (
                  <option key={business.id} value={business.name}>
                    {business.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            Account
            <select
              className="field"
              name="account"
              defaultValue={editingTx?.account || accounts[0]?.name || ''}
              required
            >
              {accounts.map(account => (
                <option key={account.id} value={account.name}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Description
            <input
              className="field"
              type="text"
              name="description"
              defaultValue={editingTx?.description || ''}
              placeholder="What was this transaction for?"
            />
          </label>

          <label>
            Notes (optional)
            <textarea
              className="field"
              name="notes"
              defaultValue={editingTx?.notes || ''}
              placeholder="Additional notes"
              rows={3}
            />
          </label>

          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className="submit-button">
              <Check size={17} />
              {editingTx ? 'Update Transaction' : 'Save Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}