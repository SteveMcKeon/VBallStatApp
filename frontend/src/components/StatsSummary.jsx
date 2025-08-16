import React, { useEffect, useState, useCallback  } from 'react';
import supabase from '..//supabaseClient';
import '../App.css';
import { useSidebar } from './SidebarContext';
import StyledSelect from './StyledSelect';
import ColumnSelector from './ColumnSelector';
import SidebarFooter from './SidebarFooter';

const StatsSummary = ({ onBack, setSidebarContent  }) => {
  const [teamName, setTeamName] = useState('');
  const [teamId, setTeamId] = useState('');
  const [availableTeams, setAvailableTeams] = useState([]);
  const setLocal = (key, value) => localStorage.setItem(key, value);
  const getLocal = (key) => localStorage.getItem(key);
  const [showSidebar, setShowSidebar] = useState(true);
  const { registerToggle } = useSidebar();
  useEffect(() => {
    registerToggle(() => setShowSidebar((prev) => !prev));
  }, [registerToggle]);  
  const [actions, setActions] = useState([]);  
  const [stats, setStats] = useState([]);
  const [games, setGames] = useState([]);
  const [selectedGame, setSelectedGame] = useState('all');
  const [selectedSet, setSelectedSet] = useState('all');
  const [assistData, setAssistData] = useState({});
  const [settingStats, setSettingStats] = useState([]);
  const [resultAnalysis, setResultAnalysis] = useState([]);
  const [selectedSetter, setSelectedSetter] = useState('all');
  const filteredSettingStats = selectedSetter === 'all'
    ? settingStats
    : settingStats.filter(stat => stat.player === selectedSetter);
  const NavToHome = () => {
    if (typeof onBack === 'function') onBack();
  };  
  
  useEffect(() => {
    const savedTeamId = getLocal('teamId');
    const fetchTeams = async () => {
    const { data, error } = await supabase
      .from('teams')
      .select('id, name')
      .order('name', { ascending: true });
      if (error) {
        console.error("Error fetching teams:", error);
        return;
      }
      setAvailableTeams(data ?? []);
      if (savedTeamId && (data ?? []).some(t => String(t.id) === String(savedTeamId))) {
        const t = data.find(tt => String(tt.id) === String(savedTeamId));
        setTeamId(savedTeamId);
        setTeamName(t?.name ?? '');
        setLocal('teamId', savedTeamId);
        setLocal('teamName', t?.name ?? '');
      } else {
        setTeamId('');
        setTeamName('');
        setLocal('teamId', '');
        setLocal('teamName', '');
      }
    };
    fetchTeams();
  }, []);  
  
  useEffect(() => {
    const fetchActions = async () => {
      if (!teamId) { setActions([]); return; }
      const { data, error } = await supabase
        .from('stats')
        .select('action_type')
        .eq('team_id', teamId)
        .not('action_type', 'is', null);
      if (error) {
        console.error('Error fetching actions:', error);
        return;
      }
      const uniqueActions = Array.from(
        new Set((data || []).map(r => r.action_type).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b));
      setActions(uniqueActions);
    };
    fetchActions();
  }, [teamId]);  
  
  useEffect(() => {
    const fetchGames = async () => {
      if (!teamId) return;
      const { data, error } = await supabase
        .from('games')
        .select('id, title, isscored, date, processed')
        .eq('team_id', teamId);
      if (!error) {
        setGames(data);
        setSelectedGame('scored');
      } else {
        console.error('Error fetching games:', error);
      }
    };

    fetchGames();
  }, [teamName]);
  useEffect(() => {
    const fetchStats = async () => {
      if (!selectedGame) return;
      let gameIds = [];
      if (selectedGame === 'all' || selectedGame === 'scored') {
        if (!teamId) return;
        let gameQuery = supabase
          .from('games')
          .select('id')
          .eq('team_id', teamId);

        if (selectedGame === 'scored') {
          gameQuery = gameQuery.eq('isscored', true);
        }

        const { data: gamesData, error: gamesError } = await gameQuery;
        if (gamesError || !gamesData) return;
        gameIds = gamesData.map(g => g.id);
      }else {
        gameIds = [selectedGame];
      }
      let query = supabase.from('stats').select('*').in('game_id', gameIds);
      if (selectedSet !== 'all') {
        query = query.eq('set', selectedSet);
      }
      const { data, error } = await query;
      if (!error && data) {
        const filteredStats = data
          .filter(stat => stat.player !== null)
          .sort((a, b) => a.import_seq - b.import_seq);
        setStats(filteredStats);
        const assistCounts = {};
        for (let i = 0; i < filteredStats.length - 1; i++) {
          const curr = filteredStats[i];
          const next = filteredStats[i + 1];
          if (
            curr.action_type === 'Set' &&
            curr.player &&
            next.result === 'Won Point'
          ) {
            assistCounts[curr.player] = (assistCounts[curr.player] || 0) + 1;
          }
        }        
        setAssistData(assistCounts);        
        const settingOnly = filteredStats.filter(
          stat => stat.set_to_position || stat.set_to_player
        );
        setSettingStats(settingOnly);

        // New logic: Count won/lost by player-action
        const resultCounts = {};
        filteredStats.forEach(({ player, action_type, result }) => {
          if (!player || !action_type || !result) return;
          const key = `${player}__${action_type}`;
          if (!resultCounts[key]) {
            resultCounts[key] = { won: 0, lost: 0, total: 0 };
          }
          if (result === 'Won Point') resultCounts[key].won += 1;
          if (result === 'Lost Point') resultCounts[key].lost += 1;
          resultCounts[key].total += 1;
        });

        const resultsArray = Object.entries(resultCounts).map(([key, val]) => {
          const [player, action] = key.split('__');
          return {
            player,
            action,
            won: val.won,
            lost: val.lost,
            total: val.total,
            pctWon: ((val.won / val.total) * 100).toFixed(1) + '%',
            pctLost: ((val.lost / val.total) * 100).toFixed(1) + '%',
          };
        });

        setResultAnalysis(resultsArray);
      }
    };
    fetchStats();
  }, [selectedGame, selectedSet, teamName]);
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
      percent: ((count / total) * 100).toFixed(1) + '%',
    }));
  };
  const grouped = stats.reduce((acc, s) => {
    if (!s.player || !s.action_type) return acc;
    const { player, action_type, quality, result } = s;

    if (!acc[player]) acc[player] = {};
    if (!acc[player][action_type]) {
      acc[player][action_type] = {
        qualities: [],
        won: 0,
        lost: 0,
      };
    }

    acc[player][action_type].qualities.push(Number(quality));
    if (result === 'Won Point') acc[player][action_type].won += 1;
    if (result === 'Lost Point') acc[player][action_type].lost += 1;

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
  const renderSidebar = useCallback(() => (
      <div className="space-y-4 flex flex-col h-full">
        <div>
          <label className="font-semibold block mb-1">Your Team:</label>
          <StyledSelect
            options={availableTeams.map(t => ({ label: t.name, value: t.id, color: 'blue' }))}
            value={teamId}
            onChange={(selected) => {
              const id = selected?.value || '';
              setTeamId(id);
              const t = availableTeams.find(tt => String(tt.id) === String(id));
              setTeamName(t?.name || '');
              setLocal('teamId', id);
              setLocal('teamName', t?.name || '');
              setSelectedGame('all');
            }}
            placeholder="Select a team"
            showStatus={false}
          />
        </div>            
        <div>
          <label className="font-semibold block mb-1">Select Game:</label>
          <StyledSelect
            options={[
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
            ]}
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
              onChange={(selected) => setSelectedSet(selected?.value || 'all')}
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
    <div className="flex flex-col overflow-hidden">
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Original Table Content */}
        <div>
          {/* Stats Table */}
          <table className="text-center table-auto">
            <thead>
              <tr>
                <th></th>
                {actions.filter(action => visibleColumns[action]?.visible).map(action => {
                  const subColSpan = allSubColumns.filter(
                    sub =>
                      visibleSubColumns[sub.key]?.visible &&
                      (!sub.actionOnly || sub.actionOnly === action)
                  ).length;
                  if (subColSpan === 0) return null;
                  return (
                    <th key={action} colSpan={subColSpan} className="p-1 font-semibold border border-black bg-gray-200">
                      {action}
                    </th>
                  );
                })}
                <th colSpan="4" className="bg-gray-200 border-l-2 border-t-2 border-r-2 p-1 font-semibold">Total</th>
              </tr>
              <tr>
                <th></th>
                {actions
                  .filter(action => visibleColumns[action]?.visible)
                  .flatMap(action =>
                    allSubColumns
                      .filter(
                        sub =>
                          visibleSubColumns[sub.key]?.visible &&
                          (!sub.actionOnly || sub.actionOnly === action)
                      )
                      .map(sub => (
                        <th
                          key={`${action}-${sub.key}`}
                          className="border bg-gray-100 p-1 text-xs"
                          title={sub.title}
                        >
                          {sub.label}
                        </th>
                      ))
                  )}
                {allSubColumns
                  .filter(
                    sub => visibleSubColumns[sub.key] && !sub.actionOnly
                  )
                  .map((sub, i, arr) => (
                    <th
                      key={`total-${sub.key}`}
                      className={`border bg-gray-100 p-1 text-xs ${
                        i === 0 ? 'border-l-2' : ''
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
                    <td className="border p-1 bg-gray-200 font-semibold">{player}</td>
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
                              .filter(
                                sub =>
                                  visibleSubColumns[sub.key]?.visible &&
                                  (!sub.actionOnly || sub.actionOnly === action)
                              )
                              .map(sub => {
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
                                  <td key={`${action}-${sub.key}`} className={`border border-black p-1 ${colorClass}`}>
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
                        .filter(
                          sub =>
                            visibleSubColumns[sub.key]?.visible &&
                            (!sub.actionOnly || sub.actionOnly === action)
                        )
                        .map(sub => {
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
                              className={`border border-black p-1 ${colorClass}`}
                            >
                              {value}
                            </td>
                          );
                        })}
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
          {/* Setting Statistics Table */}
          {settingStats.length > 0 && (
            <div className="mt-8">
              <h3 className="text-lg font-bold mb-2">Setting Statistics - Who Got Set?</h3>

              {/* Setter Filter */}
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
              <div className="flex  flex-wrap gap-8">
                <div>
                  <h4 className="font-semibold mb-1">By Position</h4>
                  <table className="text-center table-auto border-collapse mb-4">
                    <thead>
                      <tr>
                        <th className="p-1 font-semibold border border-black bg-gray-200">Position</th>
                        <th className="p-1 font-semibold border border-black bg-gray-200">Qty</th>
                        <th className="p-1 font-semibold border border-black bg-gray-200">%</th>
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
                <div>
                  <h4 className="font-semibold mb-1">By Player</h4>
                  <table className="text-center table-auto border-collapse">
                    <thead>
                      <tr>
                        <th className="p-1 font-semibold border border-black bg-gray-200">Player</th>
                        <th className="p-1 font-semibold border border-black bg-gray-200">Qty</th>
                        <th className="p-1 font-semibold border border-black bg-gray-200">%</th>
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
              </div>
            </div>
          )}       
        </div>
      </div>
    </div>
  );
};

export default StatsSummary;
