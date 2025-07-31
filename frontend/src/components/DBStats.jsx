import React, { useRef, useMemo  } from 'react';
import SortableFilterHeader from './SortableFilterHeader';
import EditableCell from './EditableCell';
import TooltipPortal from '../utils/tooltipPortal';

const IconWithTooltip = ({ children, tooltip }) => {
  const [hovered, setHovered] = React.useState(false);
  const ref = React.useRef(null);
  const [coords, setCoords] = React.useState({ top: 0, left: 0 });

  React.useEffect(() => {
    if (hovered && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setCoords({
        top: rect.top - 36,
        left: rect.left + rect.width / 2,
      });
    }
  }, [hovered]);

  return (
    <>
      <div
        ref={ref}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="inline-block"
      >
        {children}
      </div>
      {hovered && tooltip && (
        <TooltipPortal>
          <div
            className="fixed z-[9999] bg-black text-white text-xs px-2 py-1 rounded pointer-events-none whitespace-nowrap"
            style={{
              top: coords.top,
              left: coords.left,
              transform: 'translateX(-50%)',
            }}
          >
            {tooltip}
          </div>
        </TooltipPortal>
      )}
    </>
  );
};

const DBStats = ({
  isAdmin,
  stats,
  refreshStats,
  setStats,
  filteredStats,
  gamePlayers,
  visibleColumns,
  sortConfig,
  setSortConfig,
  textColumnFilters,
  handleTextColumnFilterChange,
  renderCell,
  insertButtonParentRef,
  authorizedFetch,
  layoutMode,
  jumpToTime,
  videoRef,
  videoPlayerRef,
  mainContentRef,
  containerRef,
  formatTimestamp,
  gameId,
}) => {
  const HIGHLIGHT_PRE_BUFFER = 2;
  const HIGHLIGHT_PLAY_DURATION = 5 - HIGHLIGHT_PRE_BUFFER;
  const [editingCell, setEditingCell] = React.useState(null);
  const cellRefs = useRef({});
  
  const isFiltered = Object.values(textColumnFilters).some((filter) => {
    const conditions = filter?.conditions ?? [];
    return conditions.some(({ operator, value }) =>
      ['blank', 'not_blank'].includes(operator) ||
      (operator === 'between'
        ? value?.min?.toString().trim() || value?.max?.toString().trim()
        : value?.toString().trim())
    );
  });

  const handlePlayFiltered = async () => {
    const timestamps = filteredStats
      .filter(s => s.timestamp != null)
      .map(s => s.timestamp)
      .sort((a, b) => a - b);

    if (timestamps.length === 0 || !videoPlayerRef.current) return;

    const sequences = [];
    let lastEnd = -Infinity;
    for (let i = 0; i < timestamps.length; i++) {
      const current = timestamps[i];
      const next = timestamps[i + 1];
      const start = current - HIGHLIGHT_PRE_BUFFER;
      if (start < lastEnd) continue;

      const defaultEnd = current + HIGHLIGHT_PLAY_DURATION;
      const nextClipStart = next != null ? next - HIGHLIGHT_PRE_BUFFER : Infinity;
      const end = nextClipStart < defaultEnd ? next + HIGHLIGHT_PLAY_DURATION : defaultEnd;
      sequences.push([start, end]);
      lastEnd = end;
    }

    await videoPlayerRef.current.playCustomSequences(sequences);
  };

  const renderHeader = () => (
    <tr>
      {isAdmin && <th></th>}
      {Object.entries(visibleColumns).map(([key, config]) => {
        if (!config.visible) return null;

        if (key === 'score') {
          return (
            <React.Fragment key="score-columns">
              <SortableFilterHeader
                columnKey="our_score"
                label="Our Score"
                sortConfig={sortConfig}
                onSortChange={setSortConfig}
                columnType={visibleColumns.our_score.type}
                filterValue={textColumnFilters.our_score}
                onFilterChange={handleTextColumnFilterChange}
              />
              <SortableFilterHeader
                columnKey="opp_score"
                label="Opp Score"
                sortConfig={sortConfig}
                onSortChange={setSortConfig}
                columnType={visibleColumns.opp_score.type}
                filterValue={textColumnFilters.opp_score}
                onFilterChange={handleTextColumnFilterChange}
              />
            </React.Fragment>
          );
        }

        if (['our_score', 'opp_score'].includes(key) && visibleColumns.score?.visible) return null;

        return (
          <SortableFilterHeader
            key={key}
            columnKey={key}
            label={key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
            sortConfig={sortConfig}
            onSortChange={setSortConfig}
            columnType={config.type}
            filterValue={textColumnFilters[key]}
            onFilterChange={handleTextColumnFilterChange}
            isFilterable={key !== 'timestamp'}
          />
        );
      })}
    </tr>
  );

  return (
    <>
      {isFiltered && filteredStats.length > 0 && (
        <div className="mb-4">
          <button
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 shadow"
            onClick={handlePlayFiltered}
          >
            ▶️ Play Filtered Touches ({filteredStats.length})
          </button>
        </div>
      )}

      <table className="w-full border text-center">
        <thead>{renderHeader()}</thead>
        <tbody>
          {filteredStats.length > 0 ? (
            filteredStats.map((s, idx) => {
              const prevRow = idx > 0 ? filteredStats[idx - 1] : null;
              const hasVisibleContent = Object.entries(visibleColumns).some(
                ([key, config]) =>
                  config.visible &&
                  s[key] != null &&
                  s[key] !== '' &&
                  !(typeof s[key] === 'string' && s[key].trim() === '')
              );

              if (!hasVisibleContent) return null;

              return (
                <tr
                  key={idx}
                  className={`cursor-pointer ${!isAdmin ? 'hover:bg-gray-100' : ''}`}
                  onClick={!isAdmin ? () => {
                    const validTimestamps = stats
                      .slice(0, idx)
                      .map((r) => r.timestamp)
                      .filter((t) => t != null);
                    if (s.timestamp != null) jumpToTime(s.timestamp);
                    else if (validTimestamps.length > 0)
                      jumpToTime(validTimestamps[validTimestamps.length - 1]);

                    if (
                      layoutMode === 'stacked' &&
                      !document.pictureInPictureElement &&
                      mainContentRef.current &&
                      containerRef.current
                    ) {
                      const scrollContainer = mainContentRef.current;
                      const videoEl = containerRef.current;
                      const videoBottom = videoEl.offsetTop + videoEl.offsetHeight;
                      const scrollTarget = videoBottom - scrollContainer.clientHeight;

                      scrollContainer.scrollTo({ top: scrollTarget });
                    }
                  } : undefined}
                >
                {isAdmin && (
                  <td ref={idx === 0 ? insertButtonParentRef : null} className="text-center w-8 px-1">
                    <button
                      className="w-6 h-6 flex items-center justify-center rounded-full hover:scale-110 transition-transform"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const newRow = {
                          game_id: s.game_id,
                          rally_id: s.rally_id,
                          posession_seq: (s.posession_seq || 0),
                          import_seq: (s.import_seq || 0) + 0.01,
                          our_score: s.our_score,
                          opp_score: s.opp_score,
                          set: s.set,
                        };
                        try {
                          const res = await authorizedFetch('/api/save-stats', {
                            body: { rows: [newRow] },
                          });
                          const result = await res.json();
                          if (result.success && result.insertedRows?.length) {
                            const inserted = result.insertedRows[0];
                            const index = stats.findIndex(row => row.id === s.id);
                            const updated = [...stats];
                            updated.splice(index + 1, 0, inserted);
                            setStats(updated);
                          } else {
                            alert('Failed to insert row.');
                          }
                        } catch (err) {
                          console.error('Insert failed', err);
                          alert('Insert failed');
                        }
                      }}
                    >
                      <IconWithTooltip tooltip="Add row below">
                        <svg
                          viewBox="-2 -2 24.00 24.00"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          className="w-5 h-5"
                        >
                          <rect x="-2" y="-2" width="24.00" height="24.00" rx="12" fill="#ccdfe5"></rect>
                          <path
                            stroke="#88d8a0"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M4.343 4.343l11.314 11.314m0 0h-9.9m9.9 0v-9.9"
                          />
                        </svg>
                      </IconWithTooltip>
                    </button>
                  </td>
                )}
                  {visibleColumns.timestamp?.visible && (
                    <td
                      className="border border-black cursor-pointer hover:bg-gray-100"
                      onClick={async () => {
                        if (!isAdmin) return;

                        const currentTimestamp = videoRef.current?.currentTime ?? 0;

                        const res = await authorizedFetch('/api/update-stat', {
                          body: { statId: s.id, updates: { timestamp: currentTimestamp } },
                        });
                        const result = await res.json();
                        if (result.success) {
                          const statIndex = stats.findIndex(row => row.id === s.id);
                          if (statIndex !== -1) {
                            const newStats = [...stats];
                            newStats[statIndex] = { ...stats[statIndex], timestamp: currentTimestamp };
                            setStats(newStats);
                          }
                        } else {
                          console.error('Timestamp update failed:', result.message);
                          alert('Failed to update timestamp: ' + result.message);
                        }
                      }}
                    >
                      {s.timestamp != null ? formatTimestamp(s.timestamp) : <span className="text-gray-400 italic">—</span>}
                    </td>
                  )}

                  {Object.keys(visibleColumns).map((field) => {
                    if (!visibleColumns[field]?.visible || field === 'score' || field === 'timestamp') return null;

                    const highlightClass =
                      field === 'our_score' && prevRow && s[field] > prevRow[field]
                        ? 'bg-green-100 text-green-800'
                        : field === 'opp_score' && prevRow && s[field] > prevRow[field]
                        ? 'bg-red-100 text-red-800'
                        : '';

                    return (
                      <td key={field} className={`border border-black hover:bg-gray-100 ${highlightClass} whitespace-pre-wrap`}>
                        {isAdmin ? (
                          <EditableCell
                            ref={(el) => { cellRefs.current[`${idx}-${field}`] = el; }}
                            value={s[field]}
                            type={visibleColumns[field].type}
                            statId={s.id}
                            field={field}
                            idx={idx}
                            stats={stats}
                            setStats={setStats}
                            gamePlayers={gamePlayers}
                            setEditingCell={({ idx, field, direction }) => {
                              const keys = Object.keys(visibleColumns).filter(
                                k => visibleColumns[k]?.visible && k !== 'timestamp' && k !== 'score'
                              );
                              const colIndex = keys.indexOf(field);
                              let newIdx = idx;
                              let newField = field;

                              if (direction === 'next') {
                                if (colIndex < keys.length - 1) {
                                  newField = keys[colIndex + 1];
                                } else if (idx < filteredStats.length - 1) {
                                  newIdx = idx + 1;
                                  newField = keys[0];
                                } else {
                                  return;
                                }
                              } else if (direction === 'prev') {
                                if (colIndex > 0) {
                                  newField = keys[colIndex - 1];
                                } else if (idx > 0) {
                                  newIdx = idx - 1;
                                  newField = keys[keys.length - 1];
                                } else {
                                  return; 
                                }
                              } else if (direction === 'down') {
                                if (idx < filteredStats.length - 1) {
                                  newIdx = idx + 1;
                                } else {
                                  return;
                                }
                              } else if (direction === 'up') {
                                if (idx > 0) {
                                  newIdx = idx - 1;
                                } else {
                                  return;
                                }
                              }
                              requestAnimationFrame(() => {
                                const cellRef = cellRefs.current[`${newIdx}-${newField}`];
                                if (!cellRef) return;

                                cellRef.clickToEdit?.();

                                requestAnimationFrame(() => {
                                  cellRef.focusInput?.();
                                });
                              });
                            }}
                          />
                        ) : (
                          s[field] ?? ''
                        )}
                      </td>
                    );
                  })}
                  {isAdmin && (
                    <td className="text-center w-8 px-1">
                      <button
                        className="w-6 h-6 flex items-center justify-center rounded-full hover:scale-110 transition-transform "
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            const res = await authorizedFetch(`/api/delete-stat/${s.id}`, {
                              method: 'DELETE',
                            });
                            const result = await res.json();
                            if (result.success) {
                              const updated = stats.filter(row => row.id !== s.id);
                              setStats(updated);
                            } else {
                              alert('Delete failed: ' + result.message);
                            }
                          } catch (err) {
                            console.error('Delete failed', err);
                            alert('Delete failed');
                          }
                        }}
                      >
                        <IconWithTooltip tooltip="Delete row">
                          <svg
                            viewBox="-102.4 -102.4 1228.80 1228.80"
                            className="w-6 h-6"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                          >
                            <rect x="-102.4" y="-102.4" width="1228.80" height="1228.80" rx="614.4" fill="#ccdfe5" />
                            <path d="M667.8 362.1H304V830c0 28.2 23 51 51.3 51h312.4c28.4 0 51.4-22.8 51.4-51V362.2h-51.3z" fill="#d24646"></path>
                            <path d="M750.3 295.2c0-8.9-7.6-16.1-17-16.1H289.9c-9.4 0-17 7.2-17 16.1v50.9c0 8.9 7.6 16.1 17 16.1h443.4c9.4 0 17-7.2 17-16.1v-50.9z" fill="#d24646"></path>
                            <path d="M733.3 258.3H626.6V196c0-11.5-9.3-20.8-20.8-20.8H419.1c-11.5 0-20.8 9.3-20.8 20.8v62.3H289.9c-20.8 0-37.7 16.5-37.7 36.8V346c0 18.1 13.5 33.1 31.1 36.2V830c0 39.6 32.3 71.8 72.1 71.8h312.4c39.8 0 72.1-32.2 72.1-71.8V382.2c17.7-3.1 31.1-18.1 31.1-36.2v-50.9c0.1-20.2-16.9-36.8-37.7-36.8z m-293.5-41.5h145.3v41.5H439.8v-41.5z m-146.2 83.1H729.5v41.5H293.6v-41.5z m404.8 530.2c0 16.7-13.7 30.3-30.6 30.3H355.4c-16.9 0-30.6-13.6-30.6-30.3V382.9h373.6v447.2z" fill="#211F1E"></path>
                            <path d="M511.6 798.9c11.5 0 20.8-9.3 20.8-20.8V466.8c0-11.5-9.3-20.8-20.8-20.8s-20.8 9.3-20.8 20.8v311.4c0 11.4 9.3 20.7 20.8 20.7zM407.8 798.9c11.5 0 20.8-9.3 20.8-20.8V466.8c0-11.5-9.3-20.8-20.8-20.8s-20.8 9.3-20.8 20.8v311.4c0.1 11.4 9.4 20.7 20.8 20.7zM615.4 799.6c11.5 0 20.8-9.3 20.8-20.8V467.4c0-11.5-9.3-20.8-20.8-20.8s-20.8 9.3-20.8 20.8v311.4c0 11.5 9.3 20.8 20.8 20.8z" fill="#211F1E"></path>
                          </svg>
                        </IconWithTooltip>
                      </button>
                  </td>
                  )}
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={Object.values(visibleColumns).filter(c => c.visible).length + (isAdmin ? 1 : 0)} className="py-20 text-gray-500 italic text-center border-t">
                No matching data.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {isAdmin && (
        <div className="flex justify-between items-center mt-4 px-4">
          <button
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 shadow"
            onClick={async () => {
              const lastRow = stats[stats.length - 1];
              const newRows = Array.from({ length: 10 }, (_, i) => ({
                game_id: lastRow?.game_id,
                rally_id: lastRow?.rally_id,
                posession_seq: lastRow?.posession_seq || 0,
                import_seq: (lastRow?.import_seq || 0) + 0.01 + i * 0.01,
                our_score: lastRow?.our_score,
                opp_score: lastRow?.opp_score,
                set: lastRow?.set,
              }));

              try {
                const res = await authorizedFetch('/api/save-stats', {
                  body: { rows: newRows },
                });
                const result = await res.json();
                if (result.success && result.insertedRows?.length) {
                  setStats([...stats, ...result.insertedRows]);
                } else {
                  alert('Failed to add rows.');
                }
              } catch (err) {
                console.error('Add 10 rows failed', err);
                alert('Add 10 rows failed');
              }
            }}
          >
            ➕ Add 10 Rows to Bottom
          </button>
          <button
            className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 shadow"
            onClick={refreshStats}
          >
            🔄 Refresh DB
          </button>
        </div>
      )}      
    </>
  );
};

export default DBStats;
