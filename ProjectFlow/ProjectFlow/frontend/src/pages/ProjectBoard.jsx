import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api from '../api/client';
import { ArrowLeft, Plus, UserPlus, X, MessageSquare, Calendar } from 'lucide-react';

function TaskCard({ task, onClick, onDragStart }) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onClick={onClick}
      className="card"
      style={{ padding: '0.75rem', marginBottom: '0.5rem', cursor: 'grab' }}
    >
      <div style={{ fontWeight: 500, fontSize: '0.9rem', marginBottom: '0.4rem' }}>{task.title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span className={`priority-badge priority-${task.priority}`}>{task.priority}</span>
        {task.assignee && (
          <div className="avatar avatar-sm" title={task.assignee.name}>{task.assignee.name.charAt(0)}</div>
        )}
        {task._count?.comments > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <MessageSquare size={12} /> {task._count.comments}
          </span>
        )}
        {task.dueDate && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <Calendar size={12} /> {new Date(task.dueDate).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}

export default function ProjectBoard() {
  const { projectId } = useParams();
  const { socket, joinProject, leaveProject } = useSocket();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTask, setSelectedTask] = useState(null);
  const [showAddTask, setShowAddTask] = useState(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [comment, setComment] = useState('');
  const [draggedTask, setDraggedTask] = useState(null);

  const fetchProject = useCallback(async () => {
    try {
      const res = await api.get(`/projects/${projectId}`);
      setProject(res.data.project);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  useEffect(() => {
    if (!socket || !projectId) return;
    joinProject(projectId);

    const onTaskCreated = (task) => {
      setProject((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          boards: prev.boards.map((b) => ({
            ...b,
            columns: b.columns.map((c) =>
              c.id === task.columnId ? { ...c, tasks: [...(c.tasks || []), task] } : c
            ),
          })),
        };
      });
    };

    const onTaskMoved = ({ task, fromColumnId, toColumnId }) => {
      setProject((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          boards: prev.boards.map((b) => ({
            ...b,
            columns: b.columns.map((c) => {
              if (c.id === fromColumnId) return { ...c, tasks: (c.tasks || []).filter((t) => t.id !== task.id) };
              if (c.id === toColumnId) return { ...c, tasks: [...(c.tasks || []).filter((t) => t.id !== task.id), task] };
              return c;
            }),
          })),
        };
      });
    };

    const onTaskUpdated = (task) => {
      setProject((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          boards: prev.boards.map((b) => ({
            ...b,
            columns: b.columns.map((c) => ({
              ...c,
              tasks: (c.tasks || []).map((t) => (t.id === task.id ? { ...t, ...task } : t)),
            })),
          })),
        };
      });
      setSelectedTask((s) => (s?.id === task.id ? { ...s, ...task } : s));
    };

    const onCommentCreated = ({ comment: c, taskId }) => {
      setSelectedTask((s) => {
        if (s?.id !== taskId) return s;
        return { ...s, comments: [...(s.comments || []), c] };
      });
    };

    socket.on('task:created', onTaskCreated);
    socket.on('task:moved', onTaskMoved);
    socket.on('task:updated', onTaskUpdated);
    socket.on('comment:created', onCommentCreated);

    return () => {
      leaveProject(projectId);
      socket.off('task:created', onTaskCreated);
      socket.off('task:moved', onTaskMoved);
      socket.off('task:updated', onTaskUpdated);
      socket.off('comment:created', onCommentCreated);
    };
  }, [socket, projectId, joinProject, leaveProject]);

  const handleDragStart = (e, task) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = async (e, columnId) => {
    e.preventDefault();
    if (!draggedTask || draggedTask.columnId === columnId) {
      setDraggedTask(null);
      return;
    }
    try {
      await api.patch(`/tasks/${draggedTask.id}/move`, { columnId, order: 0 });
      setProject((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          boards: prev.boards.map((b) => ({
            ...b,
            columns: b.columns.map((c) => {
              if (c.id === draggedTask.columnId) return { ...c, tasks: (c.tasks || []).filter((t) => t.id !== draggedTask.id) };
              if (c.id === columnId) return { ...c, tasks: [...(c.tasks || []), { ...draggedTask, columnId }] };
              return c;
            }),
          })),
        };
      });
    } catch (err) {
      console.error(err);
    }
    setDraggedTask(null);
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !showAddTask) return;
    try {
      await api.post('/tasks', { title: newTaskTitle, columnId: showAddTask, priority: 'MEDIUM' });
      setNewTaskTitle('');
      setShowAddTask(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create task');
    }
  };

  const openTask = async (task) => {
    try {
      const res = await api.get(`/tasks/${task.id}`);
      setSelectedTask(res.data.task);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!comment.trim() || !selectedTask) return;
    try {
      await api.post(`/tasks/${selectedTask.id}/comments`, { content: comment });
      setComment('');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add comment');
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!memberEmail.trim()) return;
    try {
      await api.post(`/projects/${projectId}/members`, { email: memberEmail });
      setMemberEmail('');
      setShowAddMember(false);
      fetchProject();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add member');
    }
  };

  const handleUpdateTask = async (updates) => {
    if (!selectedTask) return;
    try {
      const res = await api.put(`/tasks/${selectedTask.id}`, updates);
      setSelectedTask(res.data.task);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <p style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{error || 'Project not found'}</p>
        <Link to="/" className="btn btn-primary">Back to Dashboard</Link>
      </div>
    );
  }

  const columns = project.boards?.[0]?.columns || [];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-elevated)', flexWrap: 'wrap', gap: '0.75rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Link to="/" className="btn btn-ghost btn-sm"><ArrowLeft size={16} /></Link>
          <div>
            <h1 style={{ fontSize: '1.15rem', fontWeight: 700 }}>{project.name}</h1>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{project.description}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ display: 'flex', marginRight: '0.5rem' }}>
            {project.members?.slice(0, 5).map((m) => (
              <div key={m.id} className="avatar avatar-sm" title={m.user.name} style={{ marginLeft: -6, border: '2px solid var(--bg-elevated)' }}>
                {m.user.name.charAt(0)}
              </div>
            ))}
          </div>
          {(project.myRole === 'OWNER' || project.myRole === 'ADMIN') && (
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAddMember(true)}>
              <UserPlus size={16} /> Invite
            </button>
          )}
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', gap: '1rem', padding: '1rem', overflowX: 'auto', alignItems: 'flex-start' }}>
        {columns.map((col) => (
          <div
            key={col.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, col.id)}
            style={{
              minWidth: 280, maxWidth: 300, background: 'var(--bg-elevated)',
              borderRadius: 10, border: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 120px)',
            }}
          >
            <div style={{
              padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{col.name}</span>
              <span style={{ fontSize: '0.75rem', background: 'var(--bg)', padding: '0.1rem 0.45rem', borderRadius: 999, color: 'var(--text-muted)' }}>
                {col.tasks?.length || 0}
              </span>
            </div>
            <div style={{ padding: '0.5rem', overflowY: 'auto', flex: 1 }}>
              {(col.tasks || []).map((task) => (
                <TaskCard key={task.id} task={task} onClick={() => openTask(task)} onDragStart={handleDragStart} />
              ))}
              {showAddTask === col.id ? (
                <form onSubmit={handleAddTask} style={{ marginTop: '0.25rem' }}>
                  <input className="input" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} placeholder="Task title..." autoFocus style={{ marginBottom: '0.4rem', fontSize: '0.85rem' }} />
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button type="submit" className="btn btn-primary btn-sm">Add</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAddTask(null)}>Cancel</button>
                  </div>
                </form>
              ) : (
                <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: '0.25rem' }} onClick={() => setShowAddTask(col.id)}>
                  <Plus size={14} /> Add task
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {selectedTask && (
        <div className="modal-overlay" onClick={() => setSelectedTask(null)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{selectedTask.title}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedTask(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '1rem' }}>
                <label className="label">Description</label>
                <p style={{ fontSize: '0.9rem', color: selectedTask.description ? 'var(--text)' : 'var(--text-muted)' }}>
                  {selectedTask.description || 'No description'}
                </p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label className="label">Priority</label>
                  <select className="input" value={selectedTask.priority} onChange={(e) => handleUpdateTask({ priority: e.target.value })}>
                    {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Assignee</label>
                  <select className="input" value={selectedTask.assigneeId || ''} onChange={(e) => handleUpdateTask({ assigneeId: e.target.value || null })}>
                    <option value="">Unassigned</option>
                    {project.members?.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label className="label">Due Date</label>
                <input type="date" className="input" value={selectedTask.dueDate ? selectedTask.dueDate.slice(0, 10) : ''} onChange={(e) => handleUpdateTask({ dueDate: e.target.value || null })} />
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem' }}>Comments ({selectedTask.comments?.length || 0})</h3>
                <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: '0.75rem' }}>
                  {(selectedTask.comments || []).map((c) => (
                    <div key={c.id} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      <div className="avatar avatar-sm">{c.author.name.charAt(0)}</div>
                      <div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 500 }}>
                          {c.author.name} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{new Date(c.createdAt).toLocaleString()}</span>
                        </div>
                        <p style={{ fontSize: '0.85rem' }}>{c.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <form onSubmit={handleAddComment} style={{ display: 'flex', gap: '0.5rem' }}>
                  <input className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment..." style={{ flex: 1 }} />
                  <button type="submit" className="btn btn-primary btn-sm">Post</button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddMember && (
        <div className="modal-overlay" onClick={() => setShowAddMember(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Invite Member</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAddMember(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleAddMember}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="label">Email of registered user</label>
                  <input className="input" type="email" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} placeholder="bob@example.com" required autoFocus />
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>User must already have an account.</p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowAddMember(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Member</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
