import Dexie, { type Table } from 'dexie';

export type TxType = 'income' | 'expense';
export type Scope = 'personal' | 'business';

export interface Transaction {
  id?: number;
  type: TxType;
  amount: number; // store rupees as integer paise
  date: string; // YYYY-MM-DD
  category: string;
  scope: Scope;
  business?: string;
  account: string;
  description: string;
  notes?: string;
  createdAt: string;
}

export interface Business {
  id?: number;
  name: string;
  createdAt: string;
}

export interface Account {
  id?: number;
  name: string;
  kind: string;
  openingBalance: number; // integer paise
  createdAt: string;
}

class HisaabDB extends Dexie {
  transactions!: Table<Transaction, number>;
  businesses!: Table<Business, number>;
  accounts!: Table<Account, number>;

  constructor() {
    super('hisaab-local-db');
    this.version(1).stores({
      transactions: '++id, type, date, category, scope, business, account',
      businesses: '++id, name',
      accounts: '++id, name'
    });
  }
}

export const db = new HisaabDB();

export const expenseCategories = [
  'Grocery & Food', 'Household Expenses', 'Electricity & Utilities',
  'Rent / Property', 'Transportation & Fuel', 'Education',
  'Medical & Healthcare', 'Shopping & Personal Care',
  'Entertainment', 'EMI & Loans', 'Insurance', 'Staff & Salary',
  'Business Expenses', 'Maintenance & Repairs', 'Miscellaneous'
];

export const incomeCategories = [
  'Salary', 'Business Revenue', 'Freelancing', 'Rental Income',
  'Investment Returns', 'Interest', 'Commission', 'Other Income'
];

export const defaultAccounts = [
  { name: 'Cash', kind: 'Cash' },
  { name: 'Savings Account', kind: 'Bank' },
  { name: 'Current Account', kind: 'Bank' },
  { name: 'UPI', kind: 'UPI' }
];

export const toPaise = (rupees: number) => Math.round(rupees * 100);
export const fromPaise = (paise: number) => paise / 100;
