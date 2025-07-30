import React, { useRef } from 'react';
import SortableFilterHeader from './SortableFilterHeader';
import EditableCell from './EditableCell';

const DBStats = ({
  isAdmin,
  stats,
  setStats,
  filteredStats,
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
  mainContentRef,
  containerRef,
  formatTimestamp,
  gameId,
}) => {
  const HIGHLIGHT_PRE_BUFFER = 2;
  const HIGHLIGHT_PLAY_DURATION = 5 - HIGHLIGHT_PRE_BUFFER;

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

    if (timestamps.length === 0 || !videoRef.current) return;

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

    await videoRef.current.playCustomSequences(sequences);
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
                  {isAdmin && <td ref={insertButtonParentRef}></td>}

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
                      <td key={field} className={`border border-black hover:bg-gray-100 ${highlightClass}`}>
                        {isAdmin ? (
                          <EditableCell
                            value={s[field]}
                            type={visibleColumns[field].type}
                            statId={s.id}
                            field={field}
                            idx={idx}
                            stats={stats}
                            setStats={setStats}
                          />
                        ) : (
                          s[field] ?? ''
                        )}
                      </td>
                    );
                  })}
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
    </>
  );
};

export default DBStats;
