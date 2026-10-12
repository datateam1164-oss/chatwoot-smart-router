import React, { useState, useEffect, useMemo } from 'react';
import { agentsApi, autoResolverApi } from '../api/agents';
import { C } from '../styles';

export default function AutoResolverPage() {
  // Filter settings
  const [status, setStatus] = useState('pending'); // 'pending' | 'open' | 'both'
  const [hoursThreshold, setHoursThreshold] = useState(48);
  const [customHours, setCustomHours] = useState('');
  const [labelMode, setLabelMode] = useState('all'); // 'all' | 'unlabeled' | 'specific'
  const [specificLabel, setSpecificLabel] = useState('');
  const [maxPages, setMaxPages] = useState(20);
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' (Oldest first) | 'desc'

  // Available labels from Chatwoot
  const [availableLabels, setAvailableLabels] = useState([]);

  // Scanning state
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState(null);

  // Selection & Execution state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [resolving, setResolving] = useState(false);
  const [resolveProgress, setResolveProgress] = useState(null); // { current, total, percent }
  const [resolveFeedback, setResolveFeedback] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [modalTargetCount, setModalTargetCount] = useState(0);
  const [modalTargetIds, setModalTargetIds] = useState([]);
  const [confirmAcknowledged, setConfirmAcknowledged] = useState(false);


  // Search in matched list
  const [tableSearch, setTableSearch] = useState('');

  // Inactivity presets
  const presets = [
    { label: '48 Hours (2 Days)', hours: 48 },
    { label: '72 Hours (3 Days)', hours: 72 },
    { label: '5 Days (120h)', hours: 120 },
    { label: '7 Days (168h)', hours: 168 },
    { label: '9 Days (216h)', hours: 216 },
  ];

  // Load available labels on mount
  useEffect(() => {
    async function loadLabels() {
      try {
        const res = await agentsApi.fetchLabels();
        if (res?.labels && Array.isArray(res.labels)) {
          setAvailableLabels(res.labels);
          if (res.labels.length > 0 && !specificLabel) {
            setSpecificLabel(res.labels[0]);
          }
        }
      } catch (err) {
        console.warn('Failed to load labels:', err);
      }
    }
    loadLabels();
  }, []);

  // Handle Preset Selection
  const applyPreset = (h) => {
    setHoursThreshold(h);
    setCustomHours('');
  };

  // Handle Custom Hours Input
  const handleCustomHoursChange = (e) => {
    const val = e.target.value;
    setCustomHours(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      setHoursThreshold(num);
    }
  };

  // Run Scan
  const handleScan = async () => {
    setScanning(true);
    setScanError(null);
    setResolveFeedback(null);
    setSelectedIds(new Set());

    try {
      const data = await autoResolverApi.scan({
        status,
        label_mode: labelMode,
        specific_label: specificLabel,
        hours_threshold: hoursThreshold,
        max_pages: maxPages,
        sort_order: sortOrder
      });


      setScanResult(data);
      // Default to select all matched IDs
      if (data?.matched_sample && Array.isArray(data.matched_sample)) {
        const initialSelected = new Set(data.matched_sample.map(m => m.id));
        setSelectedIds(initialSelected);
      }
    } catch (err) {
      console.error('Scan error:', err);
      setScanError(err.message || 'An error occurred while scanning conversations.');
    } finally {
      setScanning(false);
    }
  };

  // Filter matched sample by search
  const filteredList = useMemo(() => {
    if (!scanResult?.matched_sample) return [];
    if (!tableSearch.trim()) return scanResult.matched_sample;
    const q = tableSearch.toLowerCase().trim();
    return scanResult.matched_sample.filter(c =>
      c.id.toString().includes(q) ||
      (c.sender_name && c.sender_name.toLowerCase().includes(q)) ||
      (c.sender_phone && c.sender_phone.includes(q)) ||
      (c.assignee_name && c.assignee_name.toLowerCase().includes(q)) ||
      (c.labels && c.labels.some(l => l.toLowerCase().includes(q)))
    );
  }, [scanResult, tableSearch]);

  // Toggle selection
  const toggleSelectOne = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredList.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredList.map(c => c.id)));
    }
  };

  // Trigger Confirmation Modal for Bulk Resolve
  const promptBulkResolve = (resolveAll = false) => {
    let idsToResolve = [];
    if (resolveAll) {
      idsToResolve = scanResult?.all_matched_ids || Array.from(selectedIds);
    } else {
      idsToResolve = Array.from(selectedIds);
    }
    if (idsToResolve.length === 0) return;
    setModalTargetCount(idsToResolve.length);
    setModalTargetIds(idsToResolve);
    setConfirmAcknowledged(false);
    setShowConfirmModal(true);
  };


  // Trigger single item resolve
  const promptSingleResolve = (cid) => {
    setModalTargetCount(1);
    setModalTargetIds([cid]);
    setConfirmAcknowledged(true);
    setShowConfirmModal(true);
  };

  // Execute Resolve in safe paced batches
  const handleExecuteResolve = async () => {
    setShowConfirmModal(false);
    setResolving(true);
    setResolveFeedback(null);

    const targets = [...modalTargetIds];
    const total = targets.length;
    const BATCH_SIZE = 30; // Safe batch size to prevent server timeout or Puma thread saturation
    let totalResolved = 0;
    let totalFailed = 0;

    setResolveProgress({ current: 0, total, percent: 0 });

    try {
      for (let i = 0; i < total; i += BATCH_SIZE) {
        const chunk = targets.slice(i, i + BATCH_SIZE);
        try {
          const res = await autoResolverApi.execute(chunk);
          totalResolved += (res.resolved_count || 0);
          totalFailed += (res.failed_count || 0);

          // Update local table and selection immediately after each batch
          const resolvedChunkSet = new Set(chunk);
          setScanResult(prev => {
            if (!prev?.matched_sample) return prev;
            const updated = prev.matched_sample.filter(c => !resolvedChunkSet.has(c.id));
            return {
              ...prev,
              total_matched: Math.max(0, prev.total_matched - (res.resolved_count || 0)),
              matched_sample: updated
            };
          });

          setSelectedIds(prev => {
            const next = new Set(prev);
            chunk.forEach(id => next.delete(id));
            return next;
          });
        } catch (chunkErr) {
          console.error('Batch resolve error:', chunkErr);
          totalFailed += chunk.length;
        }

        const processed = Math.min(i + BATCH_SIZE, total);
        const pct = Math.round((processed / total) * 100);
        setResolveProgress({ current: processed, total, percent: pct });
      }

      setResolveFeedback({
        type: totalFailed === 0 ? 'success' : 'warning',
        message: `Successfully resolved ${totalResolved} conversations! ${totalFailed > 0 ? `(${totalFailed} failed to resolve)` : ''}`
      });
    } catch (err) {
      console.error('Resolve execution failed:', err);
      setResolveFeedback({
        type: 'error',
        message: err.message || 'Failed to resolve selected conversations.'
      });
    } finally {
      setResolving(false);
      setResolveProgress(null);
    }
  };


  return (
    <div style={{
      direction: 'ltr',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      color: 'var(--text-main)',
      padding: '24px 20px',
      maxWidth: 1400,
      margin: '0 auto',
      minHeight: '100vh'
    }}>
      {/* ─── Header ─── */}
      <div style={{
        marginBottom: 24,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        paddingBottom: 20,
        borderBottom: '1px solid var(--border-subtle)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 32 }}>🧹</span>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
              Auto Conversation Resolver
            </h1>
          </div>
          <p style={{ margin: '6px 0 0 44px', color: 'var(--text-muted)', fontSize: 14 }}>
            Safely scan and bulk-resolve stale, abandoned, or bot-pending conversations that have exceeded your inactivity threshold.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            background: 'var(--primary-bg)',
            color: 'var(--primary)',
            border: '1px solid var(--primary-border)',
            borderRadius: 20,
            padding: '4px 14px',
            fontSize: 12,
            fontWeight: 700
          }}>
            Bulk Cleaner Engine
          </span>
        </div>
      </div>

      {/* ─── Control & Filter Panel ─── */}
      <div style={{
        background: 'var(--bg-surface)',
        borderRadius: 14,
        border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-card)',
        padding: '20px 24px',
        marginBottom: 24
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20
        }}>
          {/* 1. Target Status */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
              1. Conversation Status
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { id: 'pending', label: 'Pending Only (Bot / Queue)' },
                { id: 'open', label: 'Open Only' },
                { id: 'both', label: 'Both (Open & Pending)' }
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setStatus(opt.id)}
                  style={{
                    flex: 1,
                    padding: '9px 10px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    border: status === opt.id ? '1px solid var(--primary)' : '1px solid var(--border-subtle)',
                    background: status === opt.id ? 'var(--primary-bg)' : 'var(--bg-input)',
                    color: status === opt.id ? 'var(--primary)' : 'var(--text-main)',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
              Select "Pending Only" to safely target bot-handled conversations left open for days.
            </div>
          </div>

          {/* 2. Inactivity Threshold */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
              2. Minimum Inactivity Age: <span style={{ color: 'var(--primary)', fontWeight: 800 }}>{hoursThreshold} Hours ({Number((hoursThreshold / 24).toFixed(1))} Days)</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {presets.map(p => (
                <button
                  key={p.hours}
                  type="button"
                  onClick={() => applyPreset(p.hours)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: hoursThreshold === p.hours && !customHours ? '1px solid var(--primary)' : '1px solid var(--border-subtle)',
                    background: hoursThreshold === p.hours && !customHours ? 'var(--primary-bg)' : 'var(--bg-input)',
                    color: hoursThreshold === p.hours && !customHours ? 'var(--primary)' : 'var(--text-muted)',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number"
                min="1"
                step="1"
                placeholder="Custom hours (e.g. 200)"
                value={customHours}
                onChange={handleCustomHoursChange}
                style={{
                  width: '100%',
                  padding: '7px 12px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                  color: 'var(--text-main)',
                  fontSize: 12
                }}
              />
            </div>
          </div>

          {/* 3. Label Filter */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
              3. Label Filter Mode
            </label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {[
                { id: 'all', label: 'All Chats' },
                { id: 'unlabeled', label: 'Unlabeled Only' },
                { id: 'specific', label: 'Specific Label' }
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setLabelMode(opt.id)}
                  style={{
                    flex: 1,
                    padding: '7px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: labelMode === opt.id ? '1px solid var(--primary)' : '1px solid var(--border-subtle)',
                    background: labelMode === opt.id ? 'var(--primary-bg)' : 'var(--bg-input)',
                    color: labelMode === opt.id ? 'var(--primary)' : 'var(--text-main)',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {labelMode === 'specific' && (
              <select
                value={specificLabel}
                onChange={(e) => setSpecificLabel(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                  color: 'var(--text-main)',
                  fontSize: 12
                }}
              >
                {availableLabels.length === 0 ? (
                  <option value="">No labels found</option>
                ) : (
                  availableLabels.map(l => (
                    <option key={l} value={l}>{l}</option>
                  ))
                )}
              </select>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
              {labelMode === 'all' && 'Matches both labeled and unlabeled conversations.'}
              {labelMode === 'unlabeled' && 'Matches conversations that have ZERO labels.'}
              {labelMode === 'specific' && `Matches only conversations tagged with "${specificLabel}".`}
            </div>
          </div>

          {/* 4. Scan Depth */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
              4. Scan Depth (Pages)
            </label>
            <select
              value={maxPages}
              onChange={(e) => setMaxPages(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '9px 12px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                color: 'var(--text-main)',
                fontSize: 13,
                fontWeight: 600
              }}
            >
              <option value="10">10 Pages (~250 conversations)</option>
              <option value="20">20 Pages (~500 conversations) - Recommended</option>
              <option value="40">40 Pages (~1,000 conversations)</option>
              <option value="60">60 Pages (~1,500 conversations)</option>
              <option value="80">80 Pages (~2,000 conversations)</option>
              <option value="120">120 Pages (~3,000 conversations)</option>
              <option value="160">160 Pages (~4,000 conversations)</option>
            </select>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
              Higher pages allow discovering older archived chats across multiple pages.
            </div>

          </div>

          {/* 5. Scan Strategy */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
              5. Scan Strategy (Sort Order)
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { id: 'asc', label: '⏳ Oldest First (Stale Backlog)' },
                { id: 'desc', label: '⚡ Newest First' }
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSortOrder(opt.id)}
                  style={{
                    flex: 1,
                    padding: '9px 10px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    border: sortOrder === opt.id ? '1px solid var(--primary)' : '1px solid var(--border-subtle)',
                    background: sortOrder === opt.id ? 'var(--primary-bg)' : 'var(--bg-input)',
                    color: sortOrder === opt.id ? 'var(--primary)' : 'var(--text-main)',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
              "Oldest First" scans conversations starting from weeks and days ago, ideal for bot backlogs.
            </div>
          </div>
        </div>


        {/* Scan Submit Button */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button
            type="button"
            onClick={handleScan}
            disabled={scanning || resolving}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 24px',
              borderRadius: 8,
              background: scanning ? 'var(--border-subtle)' : 'var(--primary)',
              color: '#ffffff',
              border: 'none',
              fontSize: 14,
              fontWeight: 700,
              cursor: scanning || resolving ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 8px rgba(56, 189, 248, 0.3)',
              transition: 'background 0.2s ease'
            }}
          >
            {scanning ? (
              <>
                <span className="spinner" style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                Scanning Chatwoot...
              </>
            ) : (
              <>
                <span>🔍</span> Scan & Preview Matches
              </>
            )}
          </button>
        </div>
      </div>

      {/* ─── Feedback & Alerts ─── */}
      {scanError && (
        <div style={{
          padding: '14px 18px',
          background: 'var(--badge-capped-bg)',
          color: 'var(--badge-capped-text)',
          border: '1px solid var(--badge-capped-border)',
          borderRadius: 8,
          marginBottom: 20,
          fontSize: 13,
          fontWeight: 600
        }}>
          ⚠️ {scanError}
        </div>
      )}

      {resolveFeedback && (
        <div style={{
          padding: '14px 18px',
          background: resolveFeedback.type === 'success' ? 'var(--badge-ready-bg)' : 'var(--badge-capped-bg)',
          color: resolveFeedback.type === 'success' ? 'var(--badge-ready-text)' : 'var(--badge-capped-text)',
          border: resolveFeedback.type === 'success' ? '1px solid var(--badge-ready-border)' : '1px solid var(--badge-capped-border)',
          borderRadius: 8,
          marginBottom: 20,
          fontSize: 13,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }}>
          <span>{resolveFeedback.type === 'success' ? '✅' : '⚠️'}</span>
          <span>{resolveFeedback.message}</span>
        </div>
      )}

      {/* ─── Batch Resolve Progress Bar ─── */}
      {resolveProgress && (
        <div style={{
          padding: '16px 20px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--primary)',
          borderRadius: 12,
          marginBottom: 20,
          boxShadow: '0 4px 16px rgba(56, 189, 248, 0.15)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="spinner" style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              Resolving conversations in safe batches: {resolveProgress.current} / {resolveProgress.total}
            </span>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary)' }}>
              {resolveProgress.percent}%
            </span>
          </div>

          <div style={{ width: '100%', height: 10, background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{
              width: `${resolveProgress.percent}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #38bdf8, #10b981)',
              borderRadius: 6,
              transition: 'width 0.3s ease'
            }} />
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
            Using connection pooling and server pacing to ensure high reliability with zero dropped requests.
          </div>
        </div>
      )}

      {/* ─── Scan Results Overview ─── */}

      {scanResult && (
        <>
          {/* Summary Metric Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16,
            marginBottom: 24
          }}>
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 12,
              padding: '16px 18px'
            }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>Total Scanned</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-main)' }}>{scanResult.total_scanned}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>Conversations checked</div>
            </div>

            <div style={{
              background: 'var(--bg-surface)',
              border: scanResult.total_matched > 0 ? '1px solid var(--badge-capped-border)' : '1px solid var(--border-subtle)',
              borderRadius: 12,
              padding: '16px 18px'
            }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>Matched Inactive</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: scanResult.total_matched > 0 ? 'var(--badge-capped-text)' : 'var(--badge-ready-text)' }}>
                {scanResult.total_matched}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>Passed &gt; {hoursThreshold}h threshold</div>
            </div>

            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 12,
              padding: '16px 18px'
            }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>Oldest Inactivity Age</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--primary)' }}>
                {scanResult.matched_sample?.[0]?.inactive_days ? `${scanResult.matched_sample[0].inactive_days} Days` : 'N/A'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                {scanResult.matched_sample?.[0]?.inactive_hours ? `(${scanResult.matched_sample[0].inactive_hours} hours ago)` : 'None'}
              </div>
            </div>

            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 12,
              padding: '16px 18px'
            }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>Selected For Resolution</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: selectedIds.size > 0 ? '#f59e0b' : 'var(--text-dim)' }}>
                {selectedIds.size}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>Items ready to resolve</div>
            </div>
          </div>

          {/* Action Resolution Bar */}
          {scanResult.total_matched > 0 && (
            <div style={{
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--badge-capped-border)',
              borderRadius: 12,
              padding: '16px 20px',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              marginBottom: 20
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>⚠️</span>
                  <span>Ready to Resolve {selectedIds.size} Out of {scanResult.total_matched} Matched Conversations</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  Executing will toggle their status to <strong style={{ color: 'var(--text-main)' }}>Resolved</strong> in Chatwoot via API.
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                {/* Secondary Button: Resolve Checked Selection */}
                <button
                  type="button"
                  onClick={() => promptBulkResolve(false)}
                  disabled={selectedIds.size === 0 || resolving}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '10px 18px',
                    borderRadius: 8,
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    color: selectedIds.size === 0 || resolving ? 'var(--text-dim)' : 'var(--text-main)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: selectedIds.size === 0 || resolving ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <span>✓</span> Resolve Checked ({selectedIds.size})
                </button>

                {/* Primary Button: Resolve ALL Matched Conversations */}
                <button
                  type="button"
                  onClick={() => promptBulkResolve(true)}
                  disabled={scanResult.total_matched === 0 || resolving}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 22px',
                    borderRadius: 8,
                    background: scanResult.total_matched === 0 || resolving ? 'var(--border-subtle)' : '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: scanResult.total_matched === 0 || resolving ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 12px rgba(220, 38, 38, 0.35)',
                    transition: 'background 0.2s ease'
                  }}
                >
                  {resolving ? (
                    <>
                      <span className="spinner" style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      Resolving...
                    </>
                  ) : (
                    <>
                      <span>🚀</span> Resolve ALL {scanResult.total_matched} Matched
                    </>
                  )}
                </button>
              </div>
            </div>
          )}


          {/* Table Container */}
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 14,
            overflow: 'hidden',
            boxShadow: 'var(--shadow-card)'
          }}>
            {/* Table Search & Control Bar */}
            <div style={{
              padding: '14px 18px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              background: 'var(--bg-surface-elevated)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="checkbox"
                  checked={filteredList.length > 0 && selectedIds.size === filteredList.length}
                  onChange={toggleSelectAll}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                  id="select-all-checkbox"
                />
                <label htmlFor="select-all-checkbox" style={{ fontSize: 13, fontWeight: 700, cursor: 'pointer', color: 'var(--text-main)' }}>
                  Select All ({filteredList.length})
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="text"
                  placeholder="Filter by ID, name, phone, or label..."
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  style={{
                    width: 280,
                    padding: '6px 12px',
                    borderRadius: 6,
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-main)',
                    fontSize: 12
                  }}
                />
              </div>
            </div>

            {/* Conversations Table */}
            {filteredList.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>No conversations matched the filter criteria!</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
                  Either all conversations are actively updated, or you can adjust your inactivity hours / status filters.
                </div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-surface-elevated)', borderBottom: '1px solid var(--border-subtle)' }}>
                      <th style={{ padding: '12px 14px', width: 40 }}></th>
                      <th style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-muted)' }}>ID & Link</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-muted)' }}>Customer</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-muted)' }}>Status</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-muted)' }}>Assignee</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-muted)' }}>Labels</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-muted)' }}>Inactivity Age</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-muted)' }}>Last Message</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredList.map((item) => {
                      const isSelected = selectedIds.has(item.id);
                      const isStaleOverWeek = item.inactive_days >= 7;

                      return (
                        <tr
                          key={item.id}
                          style={{
                            borderBottom: '1px solid var(--border-subtle)',
                            background: isSelected ? 'var(--primary-bg)' : 'transparent',
                            transition: 'background 0.15s ease'
                          }}
                        >
                          {/* Checkbox */}
                          <td style={{ padding: '10px 14px' }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectOne(item.id)}
                              style={{ width: 16, height: 16, cursor: 'pointer' }}
                            />
                          </td>

                          {/* ID & Link */}
                          <td style={{ padding: '10px 14px' }}>
                            <a
                              href={item.chatwoot_url}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                color: 'var(--primary)',
                                fontWeight: 700,
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4
                              }}
                              title="Open in Chatwoot"
                            >
                              <span>#{item.id}</span>
                              <span style={{ fontSize: 10 }}>↗</span>
                            </a>
                          </td>

                          {/* Customer */}
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{item.sender_name}</div>
                            {item.sender_phone && (
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.sender_phone}</div>
                            )}
                          </td>

                          {/* Status */}
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              background: item.status === 'pending' ? 'var(--badge-paused-bg)' : 'var(--badge-ready-bg)',
                              color: item.status === 'pending' ? 'var(--badge-paused-text)' : 'var(--badge-ready-text)',
                              border: item.status === 'pending' ? '1px solid var(--badge-paused-border)' : '1px solid var(--badge-ready-border)',
                            }}>
                              {item.status}
                            </span>
                          </td>

                          {/* Assignee */}
                          <td style={{ padding: '10px 14px', color: item.assignee_name === 'Unassigned' ? 'var(--text-dim)' : 'var(--text-main)', fontWeight: item.assignee_name === 'Unassigned' ? 400 : 600 }}>
                            {item.assignee_name}
                          </td>

                          {/* Labels */}
                          <td style={{ padding: '10px 14px' }}>
                            {item.labels && item.labels.length > 0 ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {item.labels.map(l => (
                                  <span
                                    key={l}
                                    style={{
                                      background: 'var(--bg-input)',
                                      border: '1px solid var(--border-subtle)',
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      fontSize: 10,
                                      fontWeight: 600,
                                      color: 'var(--text-muted)'
                                    }}
                                  >
                                    {l}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-dim)', fontStyle: 'italic', fontSize: 11 }}>No label</span>
                            )}
                          </td>

                          {/* Inactivity Age */}
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '3px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 700,
                              background: isStaleOverWeek ? 'var(--badge-capped-bg)' : 'var(--badge-paused-bg)',
                              color: isStaleOverWeek ? 'var(--badge-capped-text)' : 'var(--badge-paused-text)',
                              border: isStaleOverWeek ? '1px solid var(--badge-capped-border)' : '1px solid var(--badge-paused-border)'
                            }}>
                              {item.inactive_days} Days ({item.inactive_hours}h)
                            </span>
                          </td>

                          {/* Last Message Snippet */}
                          <td style={{ padding: '10px 14px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)' }} title={item.last_message}>
                            {item.last_message || <span style={{ color: 'var(--text-dim)' }}>—</span>}
                          </td>

                          {/* Action Button */}
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={() => promptSingleResolve(item.id)}
                              disabled={resolving}
                              style={{
                                padding: '4px 10px',
                                borderRadius: 6,
                                background: 'transparent',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-muted)',
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseOver={(e) => {
                                e.currentTarget.style.borderColor = 'var(--badge-capped-border)';
                                e.currentTarget.style.color = 'var(--badge-capped-text)';
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                                e.currentTarget.style.color = 'var(--text-muted)';
                              }}
                            >
                              Resolve
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── Confirmation Modal ─── */}
      {showConfirmModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 16
        }}>
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 16,
            maxWidth: 500,
            width: '100%',
            padding: 24,
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: 'var(--badge-capped-bg)',
                border: '1px solid var(--badge-capped-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20
              }}>
                ⚠️
              </div>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                  Confirm Bulk Resolution
                </h3>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Action will affect live Chatwoot data</div>
              </div>
            </div>

            <p style={{ fontSize: 14, color: 'var(--text-main)', lineHeight: 1.6, marginBottom: 16 }}>
              You are about to resolve <strong style={{ color: '#dc2626' }}>{modalTargetCount} conversation(s)</strong>.
              Their status in Chatwoot will be permanently toggled to <strong>Resolved</strong>.
            </p>

            <div style={{
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 8,
              padding: '12px 14px',
              marginBottom: 20
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>
                <input
                  type="checkbox"
                  checked={confirmAcknowledged}
                  onChange={(e) => setConfirmAcknowledged(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                <span>I understand and confirm resolving these conversations.</span>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                style={{
                  padding: '9px 18px',
                  borderRadius: 8,
                  background: 'transparent',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-muted)',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteResolve}
                disabled={!confirmAcknowledged}
                style={{
                  padding: '9px 20px',
                  borderRadius: 8,
                  background: !confirmAcknowledged ? 'var(--border-subtle)' : '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: !confirmAcknowledged ? 'not-allowed' : 'pointer'
                }}
              >
                Yes, Resolve Conversations
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global CSS animation for spinner */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
