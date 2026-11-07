import { useEffect, useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import {
  Wallet, Home, ArrowLeftRight, Plus, ChartNoAxesCombined, Settings,
  TrendingUp, TrendingDown, Building2, Download, Upload, Trash2,
  X, Check, ChevronDown, Menu
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

const today = () => new Date().toISOString().slice(0, 10);
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

  if (authLoading) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="brand-icon"><Wallet size={22}/></div>
          <h1>HISAAB</h1>
          <p>Loading your account…</p>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="auth-screen">
        <form className="auth-card" onSubmit={submitAuth}>
          <div className="brand-icon"><Wallet size={22}/></div>
          <h1>HISAAB</h1>
          <p>Personal & Business Finance</p>

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
              autoComplete="tel"
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
              autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
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
              ? 'Please wait…'
              : authMode === 'login'
                ? 'Login'
                : 'Create account'}
          </button>

          <small>Each phone number has its own private HISAAB data.</small>
        </form>
      </div>
    );
  }

  return (
    <FinanceApp
      user={authUser}
      onLogout={async () => {
        await fetch('/.netlify/functions/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'logout' })
        });
        setAuthUser(null);
      }}
    />
  );
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
  const [businesses, setBusinesses] = useState<{id?: number; name: string}[]>([]);
  const [accounts, setAccounts] = useState<{id?: number; name: string; kind: string; openingBalance: number}[]>([]);
  const [showForm, setShowForm] = useState(false);
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

    if (!r.ok) throw new Error('Cloud save failed');
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

        if (!response.ok) {
          throw new Error('Could not load cloud data.');
        }

        const cloud = await response.json();

        await db.transaction(
          'rw',
          db.transactions,
          db.businesses,
          db.accounts,
          async () => {
            await db.transactions.clear();
            await db.businesses.clear();
            await db.accounts.clear();

            if (cloud.transactions?.length) {
              await db.transactions.bulkAdd(
                cloud.transactions.map((x: Transaction) => ({
                  ...x,
                  id: undefined
                }))
              );
            }

            if (cloud.businesses?.length) {
              await db.businesses.bulkAdd(
                cloud.businesses.map((x: {name: string; createdAt: string}) => ({
                  ...x,
                  id: undefined
                }))
              );
            }

            if (cloud.accounts?.length) {
              await db.accounts.bulkAdd(
                cloud.accounts.map((x: {
                  name: string;
                  kind: string;
                  openingBalance: number;
                  createdAt: string
                }) => ({
                  ...x,
                  id: undefined
                }))
              );
            }
          }
        );
      } catch (e) {
        setNotice(e instanceof Error ? e.message : 'Cloud connection failed.');
      }

      await refresh();

      if ((await db.accounts.count()) === 0) {
        await db.accounts.bulkAdd(
          defaultAccounts.map(a => ({
            ...a,
            openingBalance: 0,
            createdAt: new Date().toISOString()
          }))
        );

        await saveCloud();
        await refresh();
      }
    })();
  }, []);

  const visible = useMemo(() => transactions.filter(t => {
    if (view === 'personal' && t.scope !== 'personal') return false;
    if (view === 'business' && t.scope !== 'business') return false;
    if (view === 'business' && selectedBusiness && t.business !== selectedBusiness) return false;
    return true;
  }), [transactions, view, selectedBusiness]);

  const totals = useMemo(() => {
    const income = visible
      .filter(t => t.type === 'income')
      .reduce((s, t) => s + t.amount, 0);

    const expense = visible
      .filter(t => t.type === 'expense')
      .reduce((s, t) => s + t.amount, 0);

    return {
      income: fromPaise(income),
      expense: fromPaise(expense),
      net: fromPaise(income - expense)
    };
  }, [visible]);

  const accountBalance = useMemo(() => {
    const opening = accounts.reduce((s, a) => s + a.openingBalance, 0);
    const movement = transactions.reduce(
      (s, t) => s + (t.type === 'income' ? t.amount : -t.amount),
      0
    );

    return fromPaise(opening + movement);
  }, [accounts, transactions]);

  const monthData = useMemo(() => {
    const count = monthRange === 'fy' ? 12 : Number(monthRange);
    const now = new Date();
    const months: {
      key: string;
      label: string;
      balance: number;
      income: number;
      expense: number;
      opening: number;
      closing: number
    }[] = [];

    const first = new Date(now.getFullYear(), now.getMonth() - count + 1, 1);
    const allOpening = accounts.reduce((s, a) => s + a.openingBalance, 0);
    let cumulative = allOpening;

    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
    const start = new Date(first.getFullYear(), first.getMonth(), 1);

    const prior = sorted
      .filter(t => new Date(`${t.date}T00:00:00`) < start)
      .reduce(
        (s, t) => s + (t.type === 'income' ? t.amount : -t.amount),
        0
      );

    cumulative += prior;

    for (let i = 0; i < count; i++) {
      const d = new Date(first.getFullYear(), first.getMonth() + i, 1);
      const key = monthKey(d);
      const monthTx = sorted.filter(t => t.date.slice(0, 7) === key);
      const opening = cumulative;

      const income = monthTx
        .filter(t => t.type === 'income')
        .reduce((s, t) => s + t.amount, 0);

      const expense = monthTx
        .filter(t => t.type === 'expense')
        .reduce((s, t) => s + t.amount, 0);

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

    visible
      .filter(t => t.type === 'expense')
      .forEach(t => sums.set(t.category, (sums.get(t.category) || 0) + t.amount));

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
    );

  const addTransaction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const f = new FormData(e.currentTarget);
    const amount = Number(f.get('amount'));
    const scope = String(f.get('scope')) as 'personal' | 'business';
    const business = String(f.get('business') || '');

    if (!amount || amount <= 0) {
      return setNotice('Enter a valid amount.');
    }

    if (scope === 'business' && !business) {
      return setNotice('Select a business.');
    }

    const tx: Transaction = {
      type: formType,
      amount: toPaise(amount),
      date: String(f.get('date') || today()),
      category: String(f.get('category')),
      scope,
      business: scope === 'business' ? business : undefined,
      account: String(f.get('account')),
      description: String(f.get('description') || ''),
      notes: String(f.get('notes') || ''),
      createdAt: new Date().toISOString()
    };

    await db.transactions.add(tx);
    await saveCloud();

    setShowForm(false);
    setNotice('Transaction saved successfully.');
    await refresh();
    setTimeout(() => setNotice(''), 2500);
  };

  const deleteTx = async (id?: number) => {
    if (!id || !confirm('Delete this transaction?')) return;

    await db.transactions.delete(id);
    await saveCloud();
    await refresh();
  };

  const addBusiness = async () => {
    const name = businessName.trim();
    if (!name) return;

    if (businesses.some(b => b.name.toLowerCase() === name.toLowerCase())) {
      return setNotice('Business already exists.');
    }

    await db.businesses.add({
      name,
      createdAt: new Date().toISOString()
    });

    await saveCloud();
    setBusinessName('');
    await refresh();
  };

  const addAccount = async () => {
    const name = accountName.trim();
    if (!name) return;

    await db.accounts.add({
      name,
      kind: 'Other',
      openingBalance: 0,
      createdAt: new Date().toISOString()
    });

    await saveCloud();
    setAccountName('');
    await refresh();
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
        throw new Error('Invalid backup format');
      }

      if (!confirm('Replace the current data with this backup?')) return;

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
            data.transactions.map((x: Transaction) => ({
              ...x,
              id: undefined
            }))
          );

          await db.businesses.bulkAdd(
            data.businesses.map((x: {name: string; createdAt: string}) => ({
              ...x,
              id: undefined
            }))
          );

          await db.accounts.bulkAdd(
            data.accounts.map((x: {
              name: string;
              kind: string;
              openingBalance: number;
              createdAt: string
            }) => ({
              ...x,
              id: undefined
            }))
          );
        }
      );

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
      .map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(','))
      .join('\n');

    downloadFile(csv, 'hisaab-transactions.csv', 'text/csv');
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon"><Wallet size={22}/></div>
          <div>
            <strong>HISAAB</strong>
            <small>PERSONAL & BUSINESS FINANCE</small>
          </div>
        </div>
        <div className="topbar-right">
          <span className="user-phone">{user.phone}</span>
          <button className="logout-button" onClick={onLogout}>Logout</button>
          <span className="currency-pill">₹ INR</span>
        </div>
      </header>

      <main className="content">
        <div className="view-switch">
          {(['combined', 'personal', 'business'] as View[]).map(v =>
            <button
              key={v}
              className={view === v ? 'selected' : ''}
              onClick={() => setView(v)}
            >
              {v === 'combined' ? 'Combined' : v === 'personal' ? 'Personal' : 'Business'}
            </button>
          )}
        </div>

        {view === 'business' && (
          <select
            className="field business-filter"
            value={selectedBusiness}
            onChange={e => setSelectedBusiness(e.target.value)}
          >
            <option value="">All businesses</option>
            {businesses.map(b => (
              <option key={b.id} value={b.name}>{b.name}</option>
            ))}
          </select>
        )}

        {tab === 'home' && <>
          <section className="balance-card">
            <div className="eyebrow">TOTAL AVAILABLE BALANCE</div>
            <div className="balance-value">{money(accountBalance)}</div>
            <div className="balance-note">
              <span className="live-dot"/> Cloud synced balance · INR
            </div>
          </section>

          <section className="stats-grid">
            <Stat icon={<TrendingUp/>} label="Total Income" value={money(totals.income)} kind="income"/>
            <Stat icon={<TrendingDown/>} label="Total Expenses" value={money(totals.expense)} kind="expense"/>
            <Stat icon={<Wallet/>} label="Net Cash Flow" value={money(totals.net)} kind={totals.net >= 0 ? 'income' : 'expense'}/>
            <Stat icon={<Building2/>} label="Businesses" value={String(businesses.length)} kind="blue"/>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Balance History</h2>
                <p>Your month-by-month closing balance</p>
              </div>
              <select className="mini-select" value={monthRange} onChange={e => setMonthRange(e.target.value)}>
                <option value="6">6 Months</option>
                <option value="12">12 Months</option>
                <option value="24">24 Months</option>
              </select>
            </div>

            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#438cf5" stopOpacity={0.38}/>
                      <stop offset="95%" stopColor="#438cf5" stopOpacity={0.02}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#263247" strokeDasharray="3 3" vertical={false}/>
                  <XAxis dataKey="label" tick={{fill:'#8492a8',fontSize:11}} axisLine={false} tickLine={false}/>
                  <YAxis
                    tick={{fill:'#8492a8',fontSize:10}}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => v >= 100000 ? `₹${(v/100000).toFixed(1)}L` : `₹${Math.round(v/1000)}k`}
                    width={48}
                  />
                  <Tooltip content={<BalanceTooltip/>}/>
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke="#438cf5"
                    strokeWidth={3}
                    fill="url(#balanceFill)"
                    activeDot={{r:6,fill:'#60a5fa',stroke:'#fff',strokeWidth:2}}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="balance-foot">
              <span>Latest closing balance</span>
              <strong>{money(monthData.at(-1)?.closing || 0)}</strong>
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Expense Breakdown</h2>
                <p>Where your money is going</p>
              </div>
            </div>

            {categoryData.length ? (
              <div className="pie-layout">
                <div className="pie-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={48}
                        outerRadius={76}
                        paddingAngle={3}
                      >
                        {categoryData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]}/>
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => money(Number(v))}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="legend">
                  {categoryData.slice(0, 5).map((d, i) => (
                    <div className="legend-row" key={d.name}>
                      <span className="legend-dot" style={{background:COLORS[i % COLORS.length]}}/>
                      <span>{d.name}</span>
                      <b>{money(d.value)}</b>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Empty text="Add expenses to see your category breakdown."/>
            )}
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Recent Transactions</h2>
                <p>Your latest activity</p>
              </div>
              <button className="text-button" onClick={() => setTab('transactions')}>See all</button>
            </div>
            <TransactionList items={visible.slice(0, 5)} onDelete={deleteTx}/>
          </section>
        </>}

        {tab === 'transactions' && (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Transactions</h2>
                <p>All your recorded activity</p>
              </div>
            </div>

            <div className="filter-row">
              {['all', 'income', 'expense'].map(f => (
                <button
                  key={f}
                  className={filter === f ? 'filter-active' : ''}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'All' : f[0].toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            <TransactionList items={filteredTx} onDelete={deleteTx}/>
          </section>
        )}

        {tab === 'analytics' && (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Analytics</h2>
                <p>Income and expense comparison</p>
              </div>
            </div>

            <div className="chart-wrap tall">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthData}>
                  <CartesianGrid stroke="#263247" strokeDasharray="3 3" vertical={false}/>
                  <XAxis dataKey="label" tick={{fill:'#8492a8',fontSize:11}}/>
                  <YAxis tick={{fill:'#8492a8',fontSize:10}}/>
                  <Tooltip formatter={(v) => money(Number(v))}/>
                  <Bar dataKey="income" fill="#36ce91" radius={[5,5,0,0]}/>
                  <Bar dataKey="expense" fill="#ff6878" radius={[5,5,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="analytics-summary">
              <div><span>Income</span><b className="green">{money(totals.income)}</b></div>
              <div><span>Expenses</span><b className="red">{money(totals.expense)}</b></div>
            </div>
          </section>
        )}

        {tab === 'settings' && (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Settings & Data</h2>
                <p>Manage businesses, accounts and backups</p>
              </div>
            </div>

            <h3 className="subheading">Businesses</h3>
            <div className="inline-add">
              <input
                className="field"
                placeholder="Business name"
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
              />
              <button className="small-primary" onClick={addBusiness}><Plus size={17}/></button>
            </div>

            {businesses.map(b => (
              <div className="setting-row" key={b.id}>
                <Building2 size={17}/>
                <span>{b.name}</span>
              </div>
            ))}

            <h3 className="subheading">Accounts</h3>
            <div className="inline-add">
              <input
                className="field"
                placeholder="New account name"
                value={accountName}
                onChange={e => setAccountName(e.target.value)}
              />
              <button className="small-primary" onClick={addAccount}><Plus size={17}/></button>
            </div>

            {accounts.map(a => (
              <div className="setting-row" key={a.id}>
                <Wallet size={17}/>
                <span>{a.name}</span>
              </div>
            ))}

            <h3 className="subheading">Backup & Export</h3>
            <button className="wide-action" onClick={exportBackup}>
              <Download size={18}/> Export full JSON backup
            </button>

            <label className="wide-action file-label">
              <Upload size={18}/> Restore JSON backup
              <input
                type="file"
                accept=".json,application/json"
                onChange={e => importBackup(e.target.files?.[0])}
              />
            </label>

            <button className="wide-action" onClick={exportCSV}>
              <Download size={18}/> Export transactions CSV
            </button>

            <p className="privacy-note">
              Your data is synced to your private HISAAB account. Export backups regularly.
            </p>
          </section>
        )}
      </main>

      <nav className="bottom-nav">
        <NavButton active={tab === 'home'} icon={<Home/>} label="Home" onClick={() => setTab('home')}/>
        <NavButton active={tab === 'transactions'} icon={<ArrowLeftRight/>} label="Activity" onClick={() => setTab('transactions')}/>
        <button className="add-nav" onClick={() => setShowForm(true)} aria-label="Add transaction">
          <Plus size={26}/>
        </button>
        <NavButton active={tab === 'analytics'} icon={<ChartNoAxesCombined/>} label="Analytics" onClick={() => setTab('analytics')}/>
        <NavButton active={tab === 'settings'} icon={<Settings/>} label="Settings" onClick={() => setTab('settings')}/>
      </nav>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Add Transaction</h2>
                <p>Record money in or money out</p>
              </div>
              <button className="icon-button" onClick={() => setShowForm(false)}><X/></button>
            </div>

            <div className="type-switch">
              <button
                className={formType === 'expense' ? 'expense-selected' : ''}
                onClick={() => setFormType('expense')}
              >
                Expense
              </button>
              <button
                className={formType === 'income' ? 'income-selected' : ''}
                onClick={() => setFormType('income')}
              >
                Income
              </button>
            </div>

            <form onSubmit={addTransaction}>
              <label>
                Amount (₹)
                <input
                  className="field amount-input"
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  required
                  autoFocus
                />
              </label>

              <label>
                Date
                <input className="field" name="date" type="date" defaultValue={today()} required/>
              </label>

              <label>
                Category
                <select className="field" name="category" required>
                  {(formType === 'expense' ? expenseCategories : incomeCategories).map(c => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>

              <label>
                Type
                <select className="field" name="scope" defaultValue="personal">
                  <option value="personal">Personal</option>
                  <option value="business">Business</option>
                </select>
              </label>

              <label>
                Business (required for business transactions)
                <select className="field" name="business" defaultValue="">
                  <option value="">Select business</option>
                  {businesses.map(b => (
                    <option key={b.id} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </label>

              <label>
                Account
                <select className="field" name="account" required>
                  {accounts.map(a => (
                    <option key={a.id} value={a.name}>{a.name}</option>
                  ))}
                </select>
              </label>

              <label>
                Description
                <input className="field" name="description" placeholder="What was this for?"/>
              </label>

              <label>
                Notes
                <textarea className="field" name="notes" rows={2} placeholder="Optional notes"/>
              </label>

              <button className="submit-button" type="submit">
                <Check size={18}/> Save {formType}
              </button>
            </form>
          </div>
        </div>
      )}

      {notice && <div className="toast">{notice}</div>}
    </div>
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
  kind: string
}) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${kind}`}>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
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
  onClick: () => void
}) {
  return (
    <button className={`nav-button ${active ? 'nav-active' : ''}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Empty({text}: {text: string}) {
  return <div className="empty">{text}</div>;
}

function TransactionList({
  items,
  onDelete
}: {
  items: Transaction[];
  onDelete: (id?: number) => void
}) {
  if (!items.length) {
    return <Empty text="No transactions yet. Tap + to add your first one."/>;
  }

  return (
    <div className="transaction-list">
      {items.map(t => (
        <div className="transaction-row" key={t.id}>
          <div className={`tx-icon ${t.type}`}><Wallet size={17}/></div>

          <div className="tx-info">
            <strong>{t.description || t.category}</strong>
            <span>
              {t.date} · {t.scope === 'business' ? t.business : 'Personal'} · {t.category}
            </span>
          </div>

          <div className="tx-right">
            <b className={t.type === 'income' ? 'green' : 'red'}>
              {t.type === 'income' ? '+' : '−'}{money(fromPaise(t.amount))}
            </b>
            <button
              className="delete-button"
              onClick={() => onDelete(t.id)}
              aria-label="Delete"
            >
              <Trash2 size={14}/>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function BalanceTooltip({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: {payload?: {opening: number; closing: number; income: number; expense: number}}[];
  label?: string
}) {
  if (!active || !payload?.length) return null;

  const p = payload[0].payload!;

  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      <span>Opening: {money(p.opening)}</span>
      <span>Income: {money(p.income)}</span>
      <span>Expenses: {money(p.expense)}</span>
      <b>Closing: {money(p.closing)}</b>
    </div>
  );
}

function downloadFile(content: string, name: string, type: string) {
  const blob = new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
