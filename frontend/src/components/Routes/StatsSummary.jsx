import React, { useMemo, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import '../../App.css';
import StyledSelect from '../StyledSelect';
import ColumnSelector from '../ColumnSelector';
const StatsSummary = ({ onBack, setSidebarContent: setSidebarContentProp, scope }) => {
  const isPlayerScope = scope === 'player';
  const [playerName, setPlayerName] = useState('');
  const navigate = useNavigate();
  const { supabase, setSidebarContent: setSidebarFromCtx, teamId: ctxTeamId, gameId: ctxGameId, userId: ctxCurrentUserId, availableTeams, DEMO_TEAM_ID } = useOutletContext() || {};
  const setSidebarContent = setSidebarContentProp ?? setSidebarFromCtx ?? (() => { });
  const [teamName, setTeamName] = useState('');
  const [userId, setUserId] = useState(ctxCurrentUserId || '');
  const [teamId, setTeamId] = useState(isPlayerScope ? 'all' : (ctxTeamId || ''));
  const nonDemoTeams = useMemo(
    () => (availableTeams ?? []).filter(t => String(t.id) !== String(DEMO_TEAM_ID)),
    [availableTeams, DEMO_TEAM_ID]
  );
  useLayoutEffect(() => {
    if (isPlayerScope) {
      const next = nonDemoTeams.length === 1 ? String(nonDemoTeams[0].id) : 'all';
      if (teamId !== next) setTeamId(next);
    } else {
      const next = teamId === 'all' ? (ctxTeamId || '') : teamId;
      if (teamId !== next) setTeamId(next);
    }
  }, [isPlayerScope, nonDemoTeams, ctxTeamId]);
  useLayoutEffect(() => {
    setIsStatsLoading(true);
    setTableStats([]);
    setAssistData({});
    setSettingStats([]);
    setSelectedSetter('all');
  }, [isPlayerScope]);
  const [selectedGame, setSelectedGame] = useState(ctxGameId || 'scored');
  const setLocal = (key, value) => localStorage.setItem(key, value);
  const getLocal = (key) => localStorage.getItem(key);
  const [actions, setActions] = useState([]);
  const [tableStats, setTableStats] = useState([]);
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [games, setGames] = useState([]);
  const [selectedSet, setSelectedSet] = useState('all');
  const [assistData, setAssistData] = useState({});
  const [settingStats, setSettingStats] = useState([]);
  const [selectedSetter, setSelectedSetter] = useState('all');
  const filteredSettingStats = selectedSetter === 'all'
    ? settingStats
    : settingStats.filter(stat => stat.player === selectedSetter);
  const NavToHome = () => {
    if (typeof onBack === 'function') onBack();
    else navigate('/');
  };
  useEffect(() => {
    if (isPlayerScope && teamId === 'all') {
      setGames([]);
      if (selectedGame !== 'all' && selectedGame !== 'scored') {
        setSelectedGame('scored');
      }
    }
  }, [isPlayerScope, teamId, selectedGame]);
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!supabase || !isPlayerScope || userId) return;
      const { data: { user } = {} } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      setUserId(user.id);
      const meta = user.user_metadata || {};
      const fallback = user.email ? user.email.split('@')[0] : '';
      setPlayerName(meta.display_name || meta.full_name || meta.name || fallback);
    };
    run();
    return () => { cancelled = true; };
  }, [supabase, isPlayerScope, userId]);
  useEffect(() => {
    if (isStatsLoading) return;
    const unique = Array.from(
      new Set(tableStats.map(s => s.action_type).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
    setActions(unique);
  }, [tableStats, isStatsLoading]);
  useEffect(() => {
    const fetchGames = async () => {
      if (!teamId) return;
      if (!teamId || (!isPlayerScope && teamId === 'all')) return;
      if (isPlayerScope && teamId === 'all') {
        setGames([]);
        setSelectedGame('scored');
        return;
      }
      const { data, error } = await supabase
        .from('games')
        .select('id, title, isscored, date, processed')
        .eq('team_id', teamId);
      if (!error) {
        setGames(data || []);
        setSelectedGame('scored');
      } else {
        console.error('Error fetching games:', error);
      }
    };
    fetchGames();
  }, [teamId, supabase, isPlayerScope]);
  useEffect(() => {
    let alive = true;
    const fetchStats = async () => {
      setIsStatsLoading(true);
      if (!selectedGame || !supabase) {
        if (alive) setIsStatsLoading(false);
        return;
      }
      if (isPlayerScope && !userId) {
        return;
      }
      let gameIds = [];
      if (selectedGame === 'all' || selectedGame === 'scored') {
        if (!teamId || (!isPlayerScope && teamId === 'all')) {
          if (alive) setIsStatsLoading(false);
          return;
        }
        let gameQuery = supabase.from('games').select('id');
        if (teamId !== 'all') {
          gameQuery = gameQuery.eq('team_id', teamId);
        } else if (DEMO_TEAM_ID != null) {
          gameQuery = gameQuery.neq('team_id', DEMO_TEAM_ID);
        }
        if (selectedGame === 'scored') {
          gameQuery = gameQuery.eq('isscored', true);
        }
        const { data: gamesData, error: gamesError } = await gameQuery;
        if (gamesError || !gamesData) {
          setTableStats([]);
          if (alive) setIsStatsLoading(false);
          return;
        }
        gameIds = gamesData.map(g => g.id);
      } else {
        gameIds = [selectedGame];
      }
      let query = supabase.from('stats').select('*').in('game_id', gameIds);
      if (isPlayerScope) {
        query = query.eq('player_user_id', userId);
      }
      if (selectedSet !== 'all') {
        query = query.eq('set', selectedSet);
      }
      const { data, error } = await query;
      if (!error && data) {
        const demoId = DEMO_TEAM_ID != null ? String(DEMO_TEAM_ID) : null;
        let filteredStats = (data || [])
          .filter(stat => stat.player !== null)
          .filter(stat => (
            teamId === 'all'
              ? !(demoId && String(stat.team_id) === demoId)
              : String(stat.team_id) === String(teamId)
          ))
          .filter(stat => !(isPlayerScope && demoId && String(stat.team_id) === demoId))
          .sort((a, b) =>
            String(a.game_id).localeCompare(String(b.game_id)) ||
            Number(a.set ?? 0) - Number(b.set ?? 0) ||
            Number(a.import_seq ?? 0) - Number(b.import_seq ?? 0) ||
            String(a.id).localeCompare(String(b.id))
          );
        setTableStats(filteredStats);
        const assistCounts = {};
        if (selectedGame !== 'all' && selectedGame !== 'scored') {
          const gameStats = filteredStats
            .filter(stat => stat.game_id === selectedGame)
            .sort((a, b) => Number(a.import_seq ?? 0) - Number(b.import_seq ?? 0));
          for (let i = 0; i < gameStats.length - 1; i++) {
            const curr = gameStats[i];
            const next = gameStats[i + 1];
            if (
              String(curr.action_type).toLowerCase() === 'set' &&
              curr.player &&
              (next && curr.rally_id === next.rally_id) &&
              String(next.result).toLowerCase() === 'won point'
            ) {
              const key = isPlayerScope
                ? (teamNameById[String(curr.team_id)] || `Team ${curr.team_id}`)
                : curr.player;
              assistCounts[key] = (assistCounts[key] || 0) + 1;
            }
          }
        } else {
          const relevantGames = gameIds;
          relevantGames.forEach(gameId => {
            const gameStats = filteredStats
              .filter(stat => stat.game_id === gameId)
              .sort((a, b) => Number(a.import_seq ?? 0) - Number(b.import_seq ?? 0));
            for (let i = 0; i < gameStats.length - 1; i++) {
              const curr = gameStats[i];
              const next = gameStats[i + 1];
              if (
                String(curr.action_type).toLowerCase() === 'set' &&
                curr.player &&
                next && curr.rally_id === next.rally_id &&
                String(next.result).toLowerCase() === 'won point'
              ) {
                const key = isPlayerScope
                  ? (teamNameById[String(curr.team_id)] || `Team ${curr.team_id}`)
                  : curr.player;
                assistCounts[key] = (assistCounts[key] || 0) + 1;
              }
            }
          });
        }
        setAssistData(assistCounts);
        const settingOnly = filteredStats.filter(
          stat => stat.set_to_position || stat.set_to_player
        );
        setSettingStats(settingOnly);
      } else {
        setTableStats([]);
      }
      if (alive) setIsStatsLoading(false);
    };
    fetchStats();
    return () => { alive = false; };
  }, [selectedGame, selectedSet, teamId, games, supabase, isPlayerScope, playerName, userId, DEMO_TEAM_ID]);
  const [visibleColumns, setVisibleColumns] = useState({});
  const allColumns = [
    ...actions.map(action => ({ key: action, label: action })),
  ];
  useEffect(() => {
    const saved = getLocal('visibleColumnsStatsPage');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setVisibleColumns(parsed);
      } catch (err) {
        console.warn('Failed to parse visibleColumnsStatsPage:', err);
      }
    }
  }, []);
  useEffect(() => {
    if (allColumns.length === 0) return;
    setVisibleColumns(prev => {
      const defaultHidden = ['Success', 'Fail', 'Pass', 'Dig'];
      const updated = { ...prev };
      allColumns.forEach(col => {
        if (updated[col.key] === undefined) {
          updated[col.key] = { visible: !defaultHidden.includes(col.key) };
        }
      });
      return updated;
    });
  }, [JSON.stringify(allColumns)]);
  useEffect(() => {
    if (Object.keys(visibleColumns).length > 0) {
      setLocal('visibleColumnsStatsPage', JSON.stringify(visibleColumns));
    }
  }, [visibleColumns]);
  const toggleColumn = (key) => {
    setVisibleColumns(prev => ({
      ...prev,
      [key]: { visible: !prev[key]?.visible }
    }));
  };
  const allSubColumns = [
    { key: 'Qty', label: 'Qty', title: 'Number of touches' },
    { key: 'Avg', label: 'Avg', title: 'Average quality', disabled: selectedGame === 'all', },
    { key: 'Success', label: '✓', title: 'Percentage of touches that won a point' },
    { key: 'Assists', label: 'Assists', title: 'Touch led to a point via teammate', actionOnly: 'Set' },
    { key: 'Fail', label: '✗', title: 'Percentage of touches that lost a point' },
  ];
  const [visibleSubColumns, setVisibleSubColumns] = useState(() => {
    const saved = getLocal('visibleSubColumnsStatsPage');
    let initial = {};
    allSubColumns.forEach(col => {
      const defaultHidden = ['Success', 'Fail'];
      initial[col.key] = { visible: !defaultHidden.includes(col.key) };
    });
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        Object.keys(parsed).forEach(key => {
          if (initial[key] !== undefined) {
            initial[key] = parsed[key];
          }
        });
      } catch (err) {
        console.warn('Failed to parse visibleSubColumnsStatsPage:', err);
      }
    }
    return initial;
  });
  useEffect(() => {
    setVisibleSubColumns(prev => {
      const newState = { ...prev };
      if (selectedGame === 'all') {
        if (newState['Avg']?.visible) {
          newState['Avg'].visible = false;
        }
      } else {
        if (newState['Avg'] && !newState['Avg'].visible) {
          newState['Avg'].visible = true;
        }
      }
      return newState;
    });
  }, [selectedGame]);
  useEffect(() => {
    setLocal('visibleSubColumnsStatsPage', JSON.stringify(visibleSubColumns));
  }, [visibleSubColumns]);
  const toggleSubColumn = (key) => {
    setVisibleSubColumns(prev => ({
      ...prev,
      [key]: { visible: !prev[key]?.visible }
    }));
  };
  const countOccurrences = (arr, key) => {
    return arr.reduce((acc, item) => {
      const k = item[key];
      if (!k) return acc;
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
  };
  const calculatePercentages = (counts, total) => {
    return Object.entries(counts).map(([key, count]) => ({
      key,
      count,
      percent: total ? ((count / total) * 100).toFixed(1) + '%' : '0.0%',
    }));
  };
  const teamNameById = Object.fromEntries((availableTeams || []).map(t => [String(t.id), t.name]));
  const grouped = tableStats.reduce((acc, s) => {
    if (!s.action_type) return acc;
    const groupLabel = isPlayerScope
      ? (teamNameById[String(s.team_id)] || `Team ${s.team_id}`)
      : s.player;
    const { action_type, quality, result } = s;
    if (!acc[groupLabel]) acc[groupLabel] = {};
    if (!acc[groupLabel][action_type]) {
      acc[groupLabel][action_type] = { qualities: [], won: 0, lost: 0 };
    }
    acc[groupLabel][action_type].qualities.push(Number(quality));
    if (result === 'Won Point') acc[groupLabel][action_type].won += 1;
    if (result === 'Lost Point') acc[groupLabel][action_type].lost += 1;
    return acc;
  }, {});
  const players = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
  const actionTotals = actions.reduce((acc, action) => {
    let qty = 0;
    let sumQuality = 0;
    let won = 0;
    let lost = 0;
    players.forEach(player => {
      const stat = grouped[player]?.[action];
      if (stat) {
        qty += stat.qualities.length;
        sumQuality += stat.qualities.reduce((a, b) => a + b, 0);
        won += stat.won || 0;
        lost += stat.lost || 0;
      }
    });
    const avg = qty ? (sumQuality / qty).toFixed(2) : '-';
    const success = qty ? ((won / qty) * 100).toFixed(1) + '%' : '';
    const fail = qty ? ((lost / qty) * 100).toFixed(1) + '%' : '';
    acc[action] = { qty, avg, success, fail };
    return acc;
  }, {});
  const grandTotals = Object.values(actionTotals).reduce(
    (acc, val) => {
      acc.qty += val.qty || 0;
      acc.sum += parseFloat(val.avg) * (val.qty || 0) || 0;
      acc.won += parseInt(val.success) * (val.qty || 0) / 100 || 0;
      acc.lost += parseInt(val.fail) * (val.qty || 0) / 100 || 0;
      return acc;
    },
    { qty: 0, sum: 0, won: 0, lost: 0 }
  );
  const totalAvg2 = grandTotals.qty ? (grandTotals.sum / grandTotals.qty).toFixed(2) : '-';
  const totalSuccess2 = grandTotals.qty ? ((grandTotals.won / grandTotals.qty) * 100).toFixed(1) + '%' : '';
  const totalFail2 = grandTotals.qty ? ((grandTotals.lost / grandTotals.qty) * 100).toFixed(1) + '%' : '';
  const teamOptions = useMemo(() => {
    const base = (availableTeams ?? []).map(t => ({ label: t.name, value: String(t.id) }));
    if (isPlayerScope) {
      return [
        { label: 'All Teams', value: 'all' },
        ...base.filter(o => String(o.value) !== String(DEMO_TEAM_ID)),
      ];
    }
    return base;
  }, [availableTeams, isPlayerScope, DEMO_TEAM_ID]);
  const renderSidebar = useCallback(() => (
    <div className="space-y-4 flex flex-col h-full">
      <div>
        <label className="font-semibold block mb-1">Your Team:</label>
        <StyledSelect
          options={teamOptions}
          value={teamId}
          onChange={(opt) => setTeamId(opt?.value ?? (isPlayerScope ? 'all' : ''))}
          placeholder="Select a team"
          showStatus={false}
          isDisabled={isPlayerScope}
        />
      </div>
      <div>
        <label className="font-semibold block mb-1">Select Game:</label>
        <StyledSelect
          key={`${isPlayerScope ? 'player' : 'team'}|${teamId}`}
          options={
            (isPlayerScope && teamId === 'all')
              ? [
                { value: 'all', label: 'All Games' },
                { value: 'scored', label: 'All Scored Games' },
              ]
              : [
                { value: 'all', label: 'All Games' },
                { value: 'scored', label: 'All Scored Games' },
                ...games
                  .filter((game) => game.processed)
                  .sort((a, b) => new Date(b.date) - new Date(a.date))
                  .map((game) => ({
                    value: game.id,
                    label: game.title,
                    color: game.isscored ? 'green' : 'red',
                    tooltip: game.isscored ? 'Scored' : 'Not yet scored',
                  })),
              ]
          }
          value={selectedGame}
          onChange={(selected) => setSelectedGame(selected?.value || 'all')}
          placeholder="Select a game"
          showStatus={true}
          showTooltip={true}
        />
      </div>
      {selectedGame && (
        <div>
          <label className="font-semibold block mb-1">Select Set:</label>
          <StyledSelect
            options={[
              { value: 'all', label: 'All Sets' },
              { value: '1', label: 'Set 1' },
              { value: '2', label: 'Set 2' },
              { value: '3', label: 'Set 3' },
            ]}
            value={selectedSet}
            onChange={(selected) => setSelectedSet(selected?.value || 'scored')}
            placeholder="Select Set"
            showStatus={false}
          />
        </div>
      )}
      <div>
        <label className="font-semibold block mb-1">Visible Columns:</label>
        <ColumnSelector
          columns={allColumns}
          visibleColumns={visibleColumns}
          toggleColumn={toggleColumn}
        />
      </div>
      <div>
        <label className="font-semibold block mb-1">Visible SubColumns:</label>
        <ColumnSelector
          columns={allSubColumns}
          visibleColumns={visibleSubColumns}
          toggleColumn={toggleSubColumn}
        />
      </div>
      <div className="mt-auto p-4 space-y-4">
        <button
          onClick={NavToHome}
          className="w-full px-4 py-2 cursor-pointer rounded-xl text-white font-semibold shadow-md transform transition hover:scale-[1.03] bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800"
        >
          Return to Home
        </button>
      </div>
    </div>
  ), [
    teamName,
    setTeamName,
    availableTeams,
    selectedGame,
    setSelectedGame,
    selectedSet,
    setSelectedSet,
    games,
    allColumns,
    visibleColumns,
    toggleColumn,
    allSubColumns,
    visibleSubColumns,
    toggleSubColumn,
    NavToHome
  ]);
  useEffect(() => {
    setSidebarContent(renderSidebar());
    return () => setSidebarContent(null);
  }, [
    setSidebarContent,
    teamName,
    availableTeams,
    selectedGame,
    selectedSet,
    games,
    visibleColumns,
    visibleSubColumns,
  ]);
  return (
    <div className="flex flex-col min-h-full">
      {/* Main Content */}
      <div className="flex-1 p-4 relative min-h-[60vh]">
        {/* Loader overlay */}
        {isStatsLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mr-3"></div>
            <span className="text-sm text-gray-600">Loading stats…</span>
          </div>
        )}
        {/* Content (only after everything is ready) */}
        {!isStatsLoading && (
          <>
            <div className="inline-block" key={`${isPlayerScope ? 'player' : 'team'}|${teamId}|${selectedGame}`}>
              <table className="text-center table-auto inline-table w-auto max-w-fit">
                <thead>
                  <tr>
                    <th className="bg-white"></th>
                    {actions.filter(action => visibleColumns[action]?.visible).map(action => {
                      const subColSpan = allSubColumns.filter(
                        sub =>
                          visibleSubColumns[sub.key]?.visible &&
                          (!sub.actionOnly || sub.actionOnly === action)
                      ).length;
                      if (subColSpan === 0) return null;
                      return (
                        <th key={action} colSpan={subColSpan} className="p-1 font-semibold border border-black bg-gray-100">
                          {action}
                        </th>
                      );
                    })}
                    <th colSpan="4" className="bg-gray-100 border-black border-l-2 border-t-2 border-r-2 p-1 font-semibold ">Total</th>
                  </tr>
                  <tr>
                    <th className="bg-white"></th>
                    {actions
                      .filter(action => visibleColumns[action]?.visible)
                      .flatMap(action => {
                        const subs = allSubColumns
                          .filter(sub => visibleSubColumns[sub.key]?.visible && (!sub.actionOnly || sub.actionOnly === action));
                        return subs.map((sub, i) => (
                          <th
                            key={`${action}-${sub.key}`}
                            className={`border border-black bg-gray-100 p-1 text-xs border-x-1`}
                            title={sub.title}
                          >
                            {sub.label}
                          </th>
                        ));
                      })
                    }
                    {allSubColumns
                      .filter(
                        sub => visibleSubColumns[sub.key] && !sub.actionOnly
                      )
                      .map((sub, i, arr) => (
                        <th
                          key={`total-${sub.key}`}
                          className={`border border-black bg-gray-100 border-l-1 p-1 text-xs ${i === 0 ? 'border-l-2' : ''
                            } ${i === arr.length - 1 ? 'border-r-2' : ''}`}
                          title={sub.title}
                        >
                          {sub.label}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {players.map((player, index) => {
                    const isLastRow = index === players.length - 1;
                    const totals = Object.values(grouped[player] || {}).flatMap(obj => obj.qualities);
                    const totalQty = totals.length;
                    const totalAvg = totalQty ? (totals.reduce((a, b) => a + b, 0) / totalQty).toFixed(2) : '-';
                    const totalWon = Object.values(grouped[player] || {}).reduce((acc, obj) => acc + (obj.won || 0), 0);
                    const totalLost = Object.values(grouped[player] || {}).reduce((acc, obj) => acc + (obj.lost || 0), 0);
                    const rawTotalSuccess = totalQty ? ((totalWon / totalQty) * 100).toFixed(1) : null;
                    const rawTotalFail = totalQty ? ((totalLost / totalQty) * 100).toFixed(1) : null;
                    const totalSuccess = rawTotalSuccess && rawTotalSuccess !== '0.0' ? `${rawTotalSuccess}%` : '-';
                    const totalFail = rawTotalFail && rawTotalFail !== '0.0' ? `${rawTotalFail}%` : '-';
                    return (
                      <tr key={player}>
                        <td className="border p-1 bg-gray-200 font-semibold whitespace-nowrap">{player}</td>
                        {actions.filter(action => visibleColumns[action]?.visible).map(action => {
                          const actionStats = grouped[player]?.[action];
                          const qty = actionStats?.qualities.length ?? 0;
                          const avg = qty ? (actionStats.qualities.reduce((a, b) => a + b, 0) / qty).toFixed(2) : '-';
                          const rawSuccess = qty ? ((actionStats.won / qty) * 100).toFixed(1) : null;
                          const rawFail = qty ? ((actionStats.lost / qty) * 100).toFixed(1) : null;
                          const success = rawSuccess && rawSuccess !== '0.0' ? `${rawSuccess}%` : '-';
                          const fail = rawFail && rawFail !== '0.0' ? `${rawFail}%` : '-';
                          return (
                            <React.Fragment key={action}>
                              {allSubColumns
                                .filter(sub => visibleSubColumns[sub.key]?.visible && (!sub.actionOnly || sub.actionOnly === action))
                                .map((sub, i) => {
                                  let value = '-';
                                  if (sub.key === 'Qty') value = qty || '-';
                                  else if (sub.key === 'Avg') value = avg;
                                  else if (sub.key === 'Success') value = success;
                                  else if (sub.key === 'Fail') value = fail;
                                  else if (sub.key === 'Assists') {
                                    value = assistData?.[player] || 0;
                                  }
                                  const colorClass =
                                    sub.key === 'Success' && value !== '-' ? 'text-green-600' :
                                      sub.key === 'Assists' && value !== '-' ? 'text-green-600' :
                                        sub.key === 'Fail' && value !== '-' ? 'text-red-600' :
                                          '';
                                  return (
                                    <td
                                      key={`${action}-${sub.key}`}
                                      className={`border border-black p-1 ${colorClass} ${i === 0 ? 'border-l-1' : ''}`}
                                    >
                                      {value}
                                    </td>
                                  );
                                })}
                            </React.Fragment>
                          );
                        })}
                        <td className={`border border-l-2 p-1 font-semibold ${isLastRow ? 'border-b-2' : ''}`}>{totalQty}</td>
                        <td className={`border p-1 font-semibold ${isLastRow ? 'border-b-2' : ''}`}>{totalAvg}</td>
                        <td className={`border p-1 border-black text-green-600 font-semibold ${isLastRow ? 'border-b-2' : ''}`}>{totalSuccess}</td>
                        <td className={`border border-black text-red-600 border-r-2 p-1 font-semibold ${isLastRow ? 'border-b-2' : ''}`}>{totalFail}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-2 font-semibold">
                    <td className="border bg-gray-200 p-1 text-center">Total</td>
                    {actions.filter(action => visibleColumns[action]?.visible).map(action => {
                      const totals = actionTotals[action];
                      return (
                        <React.Fragment key={action}>
                          {allSubColumns
                            .filter(sub => visibleSubColumns[sub.key]?.visible && (!sub.actionOnly || sub.actionOnly === action))
                            .map((sub, i) => {
                              let value = '-';
                              if (sub.key === 'Qty') value = totals.qty || '-';
                              else if (sub.key === 'Avg') value = totals.avg;
                              else if (sub.key === 'Success') value = totals.success;
                              else if (sub.key === 'Fail') value = totals.fail;
                              else if (sub.key === 'Assists') value = Object.values(assistData).reduce((a, b) => a + b, 0);
                              const colorClass =
                                sub.key === 'Success' && value !== '-' ? 'text-green-600' :
                                  sub.key === 'Assists' && value !== '-' ? 'text-green-600' :
                                    sub.key === 'Fail' && value !== '-' ? 'text-red-600' :
                                      '';
                              return (
                                <td
                                  key={`${action}-${sub.key}`}
                                  className={`border border-black p-1 ${colorClass} ${i === 0 ? 'border-l-2' : ''}`}
                                >
                                  {value}
                                </td>
                              );
                            })
                          }
                        </React.Fragment>
                      );
                    })}
                    <td className="border border-l-2 p-1">{grandTotals.qty}</td>
                    <td className="border p-1">{totalAvg2}</td>
                    <td className="border border-black p-1 text-green-600">{totalSuccess2}</td>
                    <td className="border border-black border-r-2 p-1 text-red-600">{totalFail2}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {/* Setting Statistics / Distribution (render only when not loading) */}
            {settingStats.length > 0 && (
              <div className="mt-8">
                <h3 className="text-lg font-bold mb-2">
                  {isPlayerScope ? 'Setting Distribution' : 'Setting Statistics — Who Got Set?'}
                </h3>
                {!isPlayerScope && (
                  <div className="mb-4">
                    <label className="font-semibold block mb-1">Filter by Setter:</label>
                    <select
                      value={selectedSetter}
                      onChange={(e) => setSelectedSetter(e.target.value)}
                      className="border p-2 max-w-xs bg-gray-100"
                    >
                      <option value="all">All Setters</option>
                      {[...new Set(settingStats.map(s => s.player))]
                        .sort((a, b) => a.localeCompare(b))
                        .map((setter) => (
                          <option key={setter} value={setter}>
                            {setter}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
                <div className="flex  flex-wrap gap-8">
                  <div>
                    <h4 className="font-semibold mb-1">{isPlayerScope ? '' : 'By'}</h4>
                    <table className="text-center table-auto border-collapse mb-4">
                      <thead>
                        <tr>
                          <th className="p-1 font-semibold border border-black bg-gray-100">Position</th>
                          <th className="p-1 font-semibold border border-black bg-gray-100">Qty</th>
                          <th className="p-1 font-semibold border border-black bg-gray-100">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {['Power', 'Middle', 'Opposite', 'Backrow'].map(pos => {
                          const percentages = calculatePercentages(countOccurrences(filteredSettingStats, 'set_to_position'), filteredSettingStats.length)
                          const row = percentages.find(p => p.key === pos);
                          return row ? (
                            <tr key={row.key}>
                              <td className="border border-black p-1">{row.key}</td>
                              <td className="border border-black p-1">{row.count}</td>
                              <td className="border border-black p-1">{row.percent}</td>
                            </tr>
                          ) : null;
                        })}
                      </tbody>
                    </table>
                  </div>
                  {!isPlayerScope && (
                    <div>
                      <h4 className="font-semibold mb-1">By Player</h4>
                      <table className="text-center table-auto border-collapse">
                        <thead>
                          <tr>
                            <th className="p-1 font-semibold border border-black bg-gray-100">Player</th>
                            <th className="p-1 font-semibold border border-black bg-gray-100">Qty</th>
                            <th className="p-1 font-semibold border border-black bg-gray-100">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {calculatePercentages(countOccurrences(filteredSettingStats, 'set_to_player'), filteredSettingStats.length)
                            .sort((a, b) => a.key.localeCompare(b.key))
                            .map(row => (
                              <tr key={row.key}>
                                <td className="border border-black p-1">{row.key}</td>
                                <td className="border border-black p-1">{row.count}</td>
                                <td className="border border-black p-1">{row.percent}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div >
  );
};
export default StatsSummary;
