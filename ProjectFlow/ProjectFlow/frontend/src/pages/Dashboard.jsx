import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { Plus, FolderKanban, Users, LogOut, Bell } from 'lucide-react';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await api.get('/projects');
      setProjects(res.data.projects || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError('');
    try {
      const res = await api.post('/projects', { name, description });
      setProjects([res.data.project, ...projects]);
      setShowCreate(false);
      setName('');
      setDescription('');
      navigate(`/projects/${res.data.project.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Navbar */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-elevated)', position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <FolderKanban size={22} color="var(--primary)" />
          <span style={{ fontWeight: 700, fontSize: '1.15rem' }}>
            <span style={{ color: 'var(--primary)' }}>Project</span>Flow
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="avatar" title={user?.name}>
            {(user?.name || 'U').charAt(0).toUpperCase()}
          </div>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{user?.name}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => { logout(); navigate('/login'); }}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Your Projects</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Manage and collaborate on projects</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={18} /> New Project
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <div className="spinner" />
          </div>
        ) : projects.length === 0 ? (
          <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
            <FolderKanban size={48} color="var(--text-muted)" style={{ marginBottom: '1rem' }} />
            <h2 style={{ marginBottom: '0.5rem' }}>No projects yet</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Create your first project to get started</p>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={18} /> Create Project
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {projects.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className="card" style={{
                padding: '1.25rem', display: 'block', transition: 'border-color 0.15s, transform 0.15s',
              }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none'; }}
              >
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.4rem' }}>{p.name}</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem', minHeight: 40 }}>
                  {p.description || 'No description'}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Users size={14} color="var(--text-muted)" />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {p.members?.length || 1} member{(p.members?.length || 1) !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <span style={{
                    fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: 999,
                    background: p.myRole === 'OWNER' ? '#1e3a5f' : '#1e2a3a',
                    color: p.myRole === 'OWNER' ? '#60a5fa' : 'var(--text-muted)',
                  }}>
                    {p.myRole}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Create Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Create Project</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                {error && <div className="error-text" style={{ marginBottom: '0.75rem' }}>{error}</div>}
                <div className="form-group">
                  <label className="label">Project Name *</label>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="e.g. Career Copilot" />
                </div>
                <div className="form-group">
                  <label className="label">Description</label>
                  <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What is this project about?" />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
