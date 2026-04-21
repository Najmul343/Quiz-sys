import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { LogOut, ShieldCheck } from 'lucide-react';

export default function AdminDashboard() {
  return (
    <div className="p-8">
      <div className="bg-white rounded-3xl p-10 border border-slate-200">
        <h1 className="text-3xl font-black mb-4 flex items-center gap-3">
          <ShieldCheck className="text-blue-600" size={32} />
          Admin Control Center
        </h1>
        <p className="text-slate-500 font-medium mb-8">System-wide institute management and logs.</p>
        
        <button 
          onClick={() => signOut(auth)}
          className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </div>
  );
}
