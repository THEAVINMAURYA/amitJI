import React, { useState, useMemo } from 'react';
import { AppData, Account, AccountType, TransactionType, Transaction } from '../types';
import Modal from '../components/Modal';

interface AccountsPageProps {
  data: AppData;
  onSave: (newData: AppData) => void;
  showToast: (msg: string) => void;
}

const AccountsPage: React.FC<AccountsPageProps> = ({ data, onSave, showToast }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Partial<Account> | null>(null);
  const [viewingLedgerAcc, setViewingLedgerAcc] = useState<Account | null>(null);

  // Transfer State
  const [transferData, setTransferData] = useState({
    fromId: data.accounts[0]?.id || '',
    toId: data.accounts[1]?.id || '',
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  const openAdd = () => {
    setEditingAccount({
      id: Date.now().toString(),
      name: '',
      bankName: '',
      accountNumber: '',
      balance: 0,
      openingBalance: 0,
      type: AccountType.BANK
    });
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!editingAccount?.name) return;
    const newList = [...data.accounts];
    const index = newList.findIndex(a => a.id === editingAccount.id);
    
    if (index >= 0) {
      // Re-calculate balance based on transactions if existing
      const accTransactions = data.transactions.filter(t => t.account === editingAccount.id);
      const newBalance = (editingAccount.openingBalance || 0) + accTransactions.reduce((sum, t) => 
        t.type === TransactionType.INCOME ? sum + t.amount : sum - t.amount, 0
      );
      newList[index] = { ...editingAccount as Account, balance: newBalance };
    } else {
      newList.push({ ...editingAccount as Account, balance: editingAccount.openingBalance || 0 });
    }

    onSave({ ...data, accounts: newList });
    setIsModalOpen(false);
    showToast('Account Synced');
  };

  const handleTransfer = () => {
    if (transferData.fromId === transferData.toId) return showToast('Source and destination must be different');
    if (transferData.amount <= 0) return showToast('Transfer amount must be positive');

    const fromAcc = data.accounts.find(a => a.id === transferData.fromId);
    const toAcc = data.accounts.find(a => a.id === transferData.toId);
    if (!fromAcc || !toAcc) return;

    const timestamp = Date.now();
    
    // Outgoing Transaction (Debit from Source)
    const outTrans: Transaction = {
      id: `tf-out-${timestamp}`,
      type: TransactionType.EXPENSE,
      date: transferData.date,
      description: `Transfer to ${toAcc.name}`,
      category: 'Transfer',
      account: transferData.fromId,
      amount: transferData.amount,
      notes: transferData.notes
    };

    // Incoming Transaction (Credit to Destination)
    const inTrans: Transaction = {
      id: `tf-in-${timestamp}`,
      type: TransactionType.INCOME,
      date: transferData.date,
      description: `Transfer from ${fromAcc.name}`,
      category: 'Transfer',
      account: transferData.toId,
      amount: transferData.amount,
      notes: transferData.notes
    };

    const newAccounts = data.accounts.map(a => {
      if (a.id === transferData.fromId) return { ...a, balance: a.balance - transferData.amount };
      if (a.id === transferData.toId) return { ...a, balance: a.balance + transferData.amount };
      return a;
    });

    onSave({
      ...data,
      accounts: newAccounts,
      transactions: [outTrans, inTrans, ...data.transactions]
    });

    setIsTransferModalOpen(false);
    showToast('Internal Fund Transfer Executed');
  };

  const deleteAccount = (id: string) => {
    if (id === 'cash-default') return showToast('Cannot delete default cash pool');
    if (confirm('Deleting this account will leave its ledger entries orphaned. Proceed?')) {
      onSave({ ...data, accounts: data.accounts.filter(a => a.id !== id) });
      showToast('Account Removed');
    }
  };

  const accountLedgerData = useMemo(() => {
    if (!viewingLedgerAcc) return [];
    
    // Get all transactions for this account sorted by date ascending
    const accTransactions = data.transactions
      .filter(t => t.account === viewingLedgerAcc.id)
      .sort((a, b) => a.date.localeCompare(b.date));

    let running = viewingLedgerAcc.openingBalance || 0;
    
    return accTransactions.map(t => {
      if (t.type === TransactionType.INCOME) running += t.amount;
      else running -= t.amount;
      return { ...t, runningBalance: running };
    }).reverse(); // Latest at top
  }, [viewingLedgerAcc, data.transactions]);

  const stats = useMemo(() => {
    const assets = data.accounts.filter(a => a.type !== AccountType.LOAN).reduce((s, a) => s + a.balance, 0);
    const liabilities = data.accounts.filter(a => a.type === AccountType.LOAN).reduce((s, a) => s + a.balance, 0);
    return { assets, liabilities, net: assets - liabilities };
  }, [data.accounts]);

  return (
    <div className="space-y-10 animate-in pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight uppercase">Accounting Center</h1>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.2em] mt-1">Full-Suite Fund Reconciliation</p>
        </div>
        <div className="flex gap-4">
          <button onClick={() => setIsTransferModalOpen(true)} className="px-6 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black shadow-sm flex items-center gap-3 hover:bg-slate-50 transition-all uppercase tracking-widest text-[10px]">
            <i className="fas fa-right-left"></i> Inter-Account Transfer
          </button>
          <button onClick={openAdd} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl shadow-indigo-100 flex items-center gap-3 hover:scale-105 transition-all uppercase tracking-widest text-[10px]">
            <i className="fas fa-plus"></i> Initialize Account
          </button>
        </div>
      </header>

      {/* Summary Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Current Assets</p>
          <p className="text-3xl font-black text-emerald-600">₹{stats.assets.toLocaleString()}</p>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Liabilities</p>
          <p className="text-3xl font-black text-rose-600">₹{stats.liabilities.toLocaleString()}</p>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Global Liquidity</p>
          <p className="text-3xl font-black text-indigo-600">₹{stats.net.toLocaleString()}</p>
        </div>
      </div>

      {/* Accounts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
        {data.accounts.map((acc) => (
          <div key={acc.id} className={`bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 hover:shadow-xl transition-all border-b-4 ${acc.type === AccountType.LOAN ? 'border-b-rose-500' : 'border-b-indigo-500'}`}>
            <div className="flex justify-between items-start mb-8">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl ${acc.type === AccountType.BANK ? 'bg-indigo-50 text-indigo-600' : acc.type === AccountType.CASH ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                <i className={`fas ${acc.type === AccountType.BANK ? 'fa-building-columns' : acc.type === AccountType.CASH ? 'fa-wallet' : 'fa-hand-holding-dollar'}`}></i>
              </div>
              <div className="flex gap-2">
                 <button onClick={() => setViewingLedgerAcc(acc)} className="p-3 bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-xl transition-colors"><i className="fas fa-list-ul"></i></button>
                 <button onClick={() => { setEditingAccount(acc); setIsModalOpen(true); }} className="p-3 bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-xl transition-colors"><i className="fas fa-pen-to-square"></i></button>
                 <button onClick={() => deleteAccount(acc.id)} className="p-3 bg-slate-50 text-slate-400 hover:text-rose-500 rounded-xl transition-colors"><i className="fas fa-trash-can"></i></button>
              </div>
            </div>

            <h3 className="text-xl font-black text-slate-900 mb-1">{acc.name}</h3>
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-6">{acc.bankName} | {acc.accountNumber}</p>

            <div className="space-y-4 pt-6 border-t border-slate-50">
               <div className="flex justify-between items-end">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Available Funds</p>
                    <p className={`text-3xl font-black ${acc.balance >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>₹{acc.balance.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Opening</p>
                    <p className="text-sm font-bold text-slate-400">₹{acc.openingBalance.toLocaleString()}</p>
                  </div>
               </div>
            </div>
          </div>
        ))}
      </div>

      {/* Ledger Modal */}
      <Modal title={`Account Ledger: ${viewingLedgerAcc?.name}`} isOpen={!!viewingLedgerAcc} onClose={() => setViewingLedgerAcc(null)} maxWidth="max-w-4xl">
        <div className="space-y-6">
           <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 p-6 rounded-[2rem]">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Current Book Value</p>
                 <p className="text-2xl font-black text-slate-900">₹{viewingLedgerAcc?.balance.toLocaleString()}</p>
              </div>
              <div className="bg-indigo-50 p-6 rounded-[2rem] border border-indigo-100 flex items-center justify-between">
                 <div>
                   <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Account Context</p>
                   <p className="text-lg font-black text-indigo-600 uppercase tracking-tight">{viewingLedgerAcc?.type}</p>
                 </div>
                 <i className="fas fa-shield-halved text-2xl text-indigo-200"></i>
              </div>
           </div>

           <div className="overflow-x-auto">
              <table className="w-full text-left">
                 <thead className="bg-slate-50">
                    <tr>
                       <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                       <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Description</th>
                       <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Debit/Credit</th>
                       <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Running</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                    {accountLedgerData.map(l => (
                       <tr key={l.id} className="hover:bg-slate-50/50">
                          <td className="px-6 py-4 text-xs font-bold text-slate-400">{l.date}</td>
                          <td className="px-6 py-4">
                             <p className="text-sm font-black text-slate-800">{l.description}</p>
                             <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">{l.category}</p>
                          </td>
                          <td className={`px-6 py-4 text-right font-black ${l.type === TransactionType.INCOME ? 'text-emerald-500' : 'text-rose-500'}`}>
                             {l.type === TransactionType.INCOME ? '+' : '-'}₹{l.amount.toLocaleString()}
                          </td>
                          <td className="px-6 py-4 text-right font-black text-slate-900 text-xs">₹{l.runningBalance.toLocaleString()}</td>
                       </tr>
                    ))}
                    {accountLedgerData.length === 0 && (
                       <tr><td colSpan={4} className="py-20 text-center text-slate-200 uppercase font-black tracking-widest text-[10px]">No transaction history found</td></tr>
                    )}
                 </tbody>
              </table>
           </div>
        </div>
      </Modal>

      {/* Config Modal */}
      <Modal title="Configure Account" isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <div className="space-y-6">
           <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Account Designation</label>
              <input value={editingAccount?.name} onChange={e => setEditingAccount({...editingAccount!, name: e.target.value})} className="w-full px-5 py-4 bg-slate-50 rounded-2xl border-0 font-bold" placeholder="Main Savings" />
           </div>
           <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Account Type</label>
                <select value={editingAccount?.type} onChange={e => setEditingAccount({...editingAccount!, type: e.target.value as any})} className="w-full px-5 py-4 bg-slate-50 rounded-2xl border-0 font-bold">
                   <option value={AccountType.BANK}>Bank/Savings</option>
                   <option value={AccountType.CASH}>Cash Pool</option>
                   <option value={AccountType.LOAN}>Liability/Loan</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Opening Balance</label>
                <input type="number" value={editingAccount?.openingBalance || ''} onChange={e => setEditingAccount({...editingAccount!, openingBalance: parseFloat(e.target.value) || 0})} className="w-full px-5 py-4 bg-slate-50 rounded-2xl border-0 font-bold" placeholder="0.00" />
              </div>
           </div>
           <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Provider Name</label>
                <input value={editingAccount?.bankName} onChange={e => setEditingAccount({...editingAccount!, bankName: e.target.value})} className="w-full px-5 py-4 bg-slate-50 rounded-2xl border-0 font-bold" placeholder="HDFC, SBI, etc." />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Reference/Acc No.</label>
                <input value={editingAccount?.accountNumber} onChange={e => setEditingAccount({...editingAccount!, accountNumber: e.target.value})} className="w-full px-5 py-4 bg-slate-50 rounded-2xl border-0 font-bold" placeholder="XXXX 1234" />
              </div>
           </div>
           <button onClick={handleSave} className="w-full py-5 bg-indigo-600 text-white font-black rounded-3xl shadow-xl mt-4 uppercase tracking-widest text-[11px]">Synchronize Account Identity</button>
        </div>
      </Modal>

      {/* Transfer Modal */}
      <Modal title="Internal Fund Migration" isOpen={isTransferModalOpen} onClose={() => setIsTransferModalOpen(false)}>
         <div className="space-y-6">
            <div className="bg-indigo-50 p-8 rounded-[2rem] border border-indigo-100 flex items-center justify-between mb-4">
               <div className="text-indigo-600">
                  <p className="text-[10px] font-black uppercase tracking-widest">Double-Entry Logic</p>
                  <p className="text-xs font-bold mt-1">Funds are debited from source and credited to destination simultaneously.</p>
               </div>
               <i className="fas fa-shuffle text-3xl text-indigo-200"></i>
            </div>
            
            <div className="grid grid-cols-2 gap-6">
               <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Source Account</label>
                  <select value={transferData.fromId} onChange={e => setTransferData({...transferData, fromId: e.target.value})} className="w-full px-5 py-4 bg-slate-50 rounded-2xl border-0 font-bold">
                     {data.accounts.map(a => <option key={a.id} value={a.id}>{a.name} (₹{a.balance.toLocaleString()})</option>)}
                  </select>
               </div>
               <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Destination Account</label>
                  <select value={transferData.toId} onChange={e => setTransferData({...transferData, toId: e.target.value})} className="w-full px-5 py-4 bg-slate-50 rounded-2xl border-0 font-bold">
                     {data.accounts.map(a => <option key={a.id} value={a.id}>{a.name} (₹{a.balance.toLocaleString()})</option>)}
                  </select>
               </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
               <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Migration Date</label>
                  <input type="date" value={transferData.date} onChange={e => setTransferData({...transferData, date: e.target.value})} className="w-full px-5 py-4 bg-slate-50 rounded-2xl border-0 font-bold" />
               </div>
               <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Transfer Amount (₹)</label>
                  <input type="number" value={transferData.amount || ''} onChange={e => setTransferData({...transferData, amount: parseFloat(e.target.value) || 0})} className="w-full px-5 py-4 bg-slate-50 rounded-2xl border-0 font-bold" placeholder="0.00" />
               </div>
            </div>

            <input placeholder="Migration Notes (Internal)..." value={transferData.notes} onChange={e => setTransferData({...transferData, notes: e.target.value})} className="w-full px-5 py-4 bg-slate-50 rounded-2xl border-0 font-bold" />

            <button onClick={handleTransfer} className="w-full py-5 bg-indigo-600 text-white font-black rounded-3xl shadow-xl mt-4 uppercase tracking-widest text-[11px]">Authorize Asset Migration</button>
         </div>
      </Modal>
    </div>
  );
};

export default AccountsPage;