import { useOutletContext } from 'react-router-dom';
import DBStats from '../DBStats';
import VideoPlayer from '../VideoPlayer';
export default function TeamGameView() {
  const {
    layoutMode, editMode, allowedRole, isMobile,
    videoRef, videoPlayerRef, containerRef, mainContentRef,
    stats, setStats, sortedStats, isFiltered, filterFrozen, setFilterFrozenSafe,
    gamePlayers, effectiveVisibleColumns, sortConfig, setSortConfig,
    textColumnFilters, handleTextColumnFilterChange,
    teamId, gameId, supabase,
    jumpToTime, formatTimestamp, refreshGames, refreshStats,
    selectedVideo,
    selectedGame, displayNamesById, accessToken, DEMO_TEAM_ID
  } = useOutletContext();
  if (!selectedVideo) return null;
  return (
    <div className={`flex ${layoutMode === 'side-by-side' ? 'flex-row h-full' : 'flex-col-reverse'}`}>
      <div className={`${editMode ? 'bg-yellow-50 transition-colors' : ''} ${layoutMode === 'side-by-side' ? 'w-1/2 overflow-hidden' : 'px-4 w-full overflow-auto'}`}>
        <div className="bg-white w-full h-full flex flex-col">
          <DBStats
            canEdit={editMode && (allowedRole === 'admin' || allowedRole === 'editor')}
            displayNamesById={displayNamesById}
            editMode={editMode}
            hastimestamps={selectedGame?.hastimestamps}
            isscored={selectedGame?.isscored}
            stats={stats}
            refreshStats={refreshStats}
            setStats={setStats}
            filteredStats={sortedStats}
            isFiltered={isFiltered}
            filterFrozen={filterFrozen}
            setFilterFrozen={setFilterFrozenSafe}
            gamePlayers={gamePlayers}
            visibleColumns={effectiveVisibleColumns}
            sortConfig={sortConfig}
            setSortConfig={setSortConfig}
            textColumnFilters={textColumnFilters}
            handleTextColumnFilterChange={handleTextColumnFilterChange}
            layoutMode={layoutMode}
            jumpToTime={jumpToTime}
            videoRef={videoRef}
            videoPlayerRef={videoPlayerRef}
            mainContentRef={mainContentRef}
            containerRef={containerRef}
            formatTimestamp={formatTimestamp}
            gameId={gameId}
            refreshGames={refreshGames}
            supabase={supabase}
            teamId={teamId}
            isMobile={isMobile}
          />
        </div>
      </div>
      <div className={`${layoutMode === 'side-by-side' ? 'w-1/2' : 'w-full'}`}>
        <VideoPlayer
          ref={videoPlayerRef}
          selectedVideo={selectedVideo}
          videoRef={videoRef}
          containerRef={containerRef}
          stats={stats}
          gameId={selectedGame?.id ?? gameId}
          accessToken={accessToken}
          DEMO_TEAM_ID={DEMO_TEAM_ID}
        />
      </div>
    </div>
  );
}