import React, { useRef, useState, useEffect } from 'react';
import supabase from '../supabaseClient';
import '../App.css';
import VideoPlayer from './VideoPlayer';
import ColumnSelector from './ColumnSelector';
import { useSidebar } from './SidebarContext';
import SortableFilterHeader from './SortableFilterHeader';
import { useNavigate } from 'react-router-dom';
import GameSelector from './GameSelector';
import StyledSelect from './StyledSelect';
import EditMode from './EditMode';
import EditableCell from './EditableCell';
import DBStats from './DBStats';

const HEADER_HOVER_ZONE_PX = 50;

const MainPage = () => {
  const navigate = useNavigate();
  const [isAppLoading, setIsAppLoading] = useState(true);
  const videoPlayerRef = useRef(null);
  const setLocal = (key, value) => localStorage.setItem(key, value);
  const getLocal = (key) => localStorage.getItem(key);
  const [teamName, setTeamName] = useState('');
  const [availableTeams, setAvailableTeams] = useState([]);
  const handleTeamChange = async (e) => {
    const selected = e.target.value;
    setTeamName(selected);
    setLocal('teamName', selected);
    setSelectedVideo('');
    setSelectedGameId('');
    const { data, error } = await supabase
      .from('games')
      .select('id, title, date, video_url, hastimestamps, isscored')
      .eq('team_name', selected)
      .order('date', { ascending: false });
    
    if (error) {
      console.error("Error fetching games:", error);
    } else {
      setTeamGames(data);
    }
  };    
  useEffect(() => {
    const savedTeam = getLocal('teamName');
    const fetchTeams = async () => {
    const unique = await fetchTeamNames();
    setAvailableTeams(unique);
      if (savedTeam && unique.includes(savedTeam)) {
        setLocal('teamName', savedTeam);
        (async () => {
          await handleTeamChange({ target: { value: savedTeam } });
        })();
      } else {
        setTeamName('');
        setLocal('teamName', '');
      }
      };
    fetchTeams();
  }, []);
  const [teamGames, setTeamGames] = useState([]);
  const [selectedGameId, setSelectedGameId] = useState('');
  const [textColumnFilters, setTextColumnFilters] = useState({});
  const handleTextColumnFilterChange = (column, value) => {
    const colType = visibleColumns[column]?.type;
    if (typeof value === 'string') {
      const operator = ['text'].includes(colType) ? 'contains' : 'equals';
      setTextColumnFilters((prev) => ({
        ...prev,
        [column]: {
          conditions: [{ operator, value }]
        }
      }));
    } else {
      setTextColumnFilters((prev) => ({
        ...prev,
        [column]: value
      }));
    }
  };
  const [containerHeight, setContainerHeight] = useState(0); 
  const insertButtonParentRef = useRef(null);
  useEffect(() => {
    const updateHeight = () => {
      if (insertButtonParentRef.current) {
        setContainerHeight(insertButtonParentRef.current.offsetHeight);
      }
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []); 
  const savedVisibleColumns = getLocal('visibleColumnsMainPage');
  const savedLayout = getLocal('layoutMode');  
  const videoRef = useRef(null);
  const mainContentRef = useRef(null);
  const containerRef = useRef(null);
  const [stats, setStats] = useState([]);
  const [videoList, setVideoList] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState('');
  const [gameId, setGameId] = useState(null);
  const { isAdmin, handleEditModeLogin, authorizedFetch, logout } = EditMode();
  const isFiltered =
    Object.values(textColumnFilters).some((filter) => {
      const conditions = filter?.conditions ?? [];
      return conditions.some(({ operator, value }) =>
        ['blank', 'not_blank'].includes(operator) ||
        (operator === 'between'
          ? value?.min?.toString().trim() || value?.max?.toString().trim()
          : value?.toString().trim())
      );
    });
  const [showOverlay, setShowOverlay] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const { registerToggle } = useSidebar();  
  useEffect(() => {
    registerToggle(() => setShowSidebar((prev) => !prev));
  }, [registerToggle]);  
  const [layoutMode, setLayoutMode] = useState(() => {
    try {
      return savedLayout
        ? decodeURIComponent(savedLayout)
        : 'stacked';
    } catch {
      return 'stacked';
    }
  });
  const [sortConfig, setSortConfig] = useState({ key: 'import_seq', direction: 'asc' });
  const defaultColumnConfig = {
    timestamp: { visible: false, type: 'float8' },
    set: { visible: false, type: 'int2' },
    rally_id: { visible: false, type: 'int2' },
    posession_seq: { visible: false, type: 'int2' },
    player: { visible: true, type: 'text' },
    action_type: { visible: true, type: 'text' },
    quality: { visible: true, type: 'numeric' },
    result: { visible: false, type: 'text' },
    notes: { visible: true, type: 'text' },
    score: { visible: false, type: 'int2' },
    our_score: { visible: false, type: 'int2' },
    opp_score: { visible: false, type: 'int2' },
  };
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const loaded = savedVisibleColumns
        ? JSON.parse(decodeURIComponent(savedVisibleColumns))
        : {};
      return Object.fromEntries(
        Object.entries(defaultColumnConfig).map(([key, def]) => [
          key,
          { ...def, ...loaded[key] },
        ])
      );
    } catch (err) {
      return defaultColumnConfig;
    }
  });
  const toggleColumn = (col) => {
    setVisibleColumns((prev) => {
      const isNowVisible = !prev[col]?.visible;
      if (col === 'score') {
        return {
          ...prev,
          score: { ...prev.score, visible: isNowVisible },
          our_score: { ...prev.our_score, visible: isNowVisible },
          opp_score: { ...prev.opp_score, visible: isNowVisible },
        };
      }
      return {
        ...prev,
        [col]: {
          ...prev[col],
          visible: isNowVisible
        }
      };
    });
  };
  const lastScrollY = useRef(0);
  const suppressScrollDetection = useRef(false);
  useEffect(() => {
    if (selectedGameId) {
      localStorage.setItem('selectedGameId', selectedGameId);
    }
  }, [selectedGameId]);
  const fetchTeamNames = async () => {
    const { data, error } = await supabase
      .from('games')
      .select('team_name')
      .neq('team_name', '')
      .order('team_name', { ascending: true });

    if (error) {
      console.error("Error fetching teams:", error);
      return [];
    }

    return [...new Set(data.map(row => row.team_name))];
  };  
  useEffect(() => {
    setIsAppLoading(true);
    const savedTeam = getLocal('teamName');
    const savedGame = localStorage.getItem('selectedGameId');

    const fetchAndRestore = async () => {
    const unique = await fetchTeamNames();
    setAvailableTeams(unique);

      if (savedTeam && unique.includes(savedTeam)) {
        setTeamName(savedTeam);
        await handleTeamChange({ target: { value: savedTeam } });
        const { data: gamesData, error: gamesError } = await supabase
          .from('games')
          .select('id, title, date, video_url, hastimestamps, isscored')
          .eq('team_name', savedTeam)
          .order('date', { ascending: false });

        if (!gamesError && gamesData) {
          setTeamGames(gamesData);
          if (savedGame && gamesData.some(g => g.id === savedGame)) {
            const selectedGame = gamesData.find(g => g.id === savedGame);
            setSelectedGameId(savedGame);
            setSelectedVideo(selectedGame?.video_url || '');
          }
        }
      } else {
        setTeamName('');
        setLocal('teamName', '');
      }

      setIsAppLoading(false);
    };

    fetchAndRestore();
  }, []);
  useEffect(() => {
    setLocal('visibleColumnsMainPage', JSON.stringify(visibleColumns));
  }, [visibleColumns]);
  const handleHeaderClick = (columnKey) => {
    setSortConfig((prev) => {
      if (prev.key === columnKey) {
        if (prev.direction === 'asc') return { key: columnKey, direction: 'desc' };
        if (prev.direction === 'desc') return { key: 'import_seq', direction: 'asc' }; // Reset
      }
      return { key: columnKey, direction: 'asc' };
    });
  };  
  useEffect(() => {
    setLocal('layoutMode', layoutMode);
  }, [layoutMode]);
  useEffect(() => {
    fetch('/api/videos')
      .then(async res => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Fetch failed: ${res.status} ${res.statusText} — ${text}`);
        }
        return res.json();
      })
      .then(setVideoList)
      .catch(err => {
        console.error('Failed to load videos:', err.message);
      });
  }, []);
  useEffect(() => {
    if (!selectedVideo) {
      setStats([]); 
      return;
    }
    setStats([]);
    (async () => {
      const { data: existing, error: existingError } = await supabase
        .from('games')
        .select('id')
        .eq('video_url', selectedVideo)
        .single();
      if (existingError || !existing?.id) {
        console.error('Error checking for game:', existingError);
        setStats([]);
        return;
      }
      setGameId(existing.id);
      const { data: statData, error: statError } = await supabase
        .from('stats')
        .select('*')
        .eq('game_id', existing.id)
        .order('import_seq', { ascending: true });

      if (statError || !statData) {
        console.error('Failed to fetch stats:', statError);
        setStats([]);
      } else {
        setStats(statData);
      }
    })();
  }, [selectedVideo]);
  const uniqueValues = (key) =>
    [...new Set(stats.map((s) => s[key]).filter((v) => v !== undefined && v !== null))];
  const filteredStats = stats
    .filter((s) =>
      Object.entries(visibleColumns).some(([key, col]) =>
        col.visible && s[key] !== undefined && s[key] !== null && s[key] !== ''
      )
    )
    .filter((s) =>
      Object.entries(textColumnFilters).every(([key, filter]) => {
        const colType = visibleColumns[key]?.type;
        const conditions = filter?.conditions ?? [];
        const activeConditions = conditions.filter(({ operator, value }) =>
          ['blank', 'not_blank'].includes(operator) ||
          (value !== null && value !== undefined && value !== '')
        );
        if (activeConditions.length === 0) return true;
        const evaluateText = ({ operator, value }) => {
          const cellVal = (s[key] ?? '').toString().toLowerCase();
          const v = (value ?? '').toLowerCase();
          switch (operator) {
            case 'contains': return cellVal.includes(v);
            case 'not_contains': return !cellVal.includes(v);
            case 'equals': return cellVal === v;
            case 'not_equals': return cellVal !== v;
            case 'starts_with': return cellVal.startsWith(v);
            case 'ends_with': return cellVal.endsWith(v);
            case 'blank': return cellVal.trim() === '';
            case 'not_blank': return cellVal.trim() !== '';
            default: return true;
          }
        };
        const evaluateNumber = (cond) => {
          const rawValue = s[key];
          if (cond.operator === 'blank') return rawValue == null || rawValue === '';
          if (cond.operator === 'not_blank') return rawValue != null && rawValue !== '';
          if (rawValue == null || rawValue === '') return false;
          const numericValue = Number(rawValue);
          if (isNaN(numericValue)) return false;
          switch (cond.operator) {
            case 'equals': {
              const conditionValue = Number(cond.value);
              return !isNaN(conditionValue) && numericValue === conditionValue;
            }
            case 'not_equals': {
              const conditionValue = Number(cond.value);
              return !isNaN(conditionValue) && numericValue !== conditionValue;
            }
            case 'lt': {
              const conditionValue = Number(cond.value);
              return !isNaN(conditionValue) && numericValue < conditionValue;
            }
            case 'lte': {
              const conditionValue = Number(cond.value);
              return !isNaN(conditionValue) && numericValue <= conditionValue;
            }
            case 'gt': {
              const conditionValue = Number(cond.value);
              return !isNaN(conditionValue) && numericValue > conditionValue;
            }
            case 'gte': {
              const conditionValue = Number(cond.value);
              return !isNaN(conditionValue) && numericValue >= conditionValue;
            }
            case 'between': {
              const min = Number(cond.value?.min);
              const max = Number(cond.value?.max);
              return !isNaN(min) && !isNaN(max) && numericValue >= min && numericValue <= max;
            }
            default:
              return false;
          }
        };
        const isNumberType = ['int2', 'int4', 'int8', 'float4', 'float8', 'numeric'].includes(colType);
        const evaluator = isNumberType ? evaluateNumber : evaluateText;
        let result = null; // neutral start
        for (let i = 0; i < activeConditions.length; i++) {
          const cond = activeConditions[i];
          const condResult = evaluator(cond);
          if (result === null) {
            result = condResult; // first condition sets baseline
          } else {
            const logic = cond.logic || 'AND';
            if (logic === 'AND') result = result && condResult;
            if (logic === 'OR') result = result || condResult;
          }
        }
        return result ?? true; // fallback to true if no conditions
      })
    )

  const sortedStats = [...filteredStats].sort((a, b) => {
    const { key, direction } = sortConfig;
    const aVal = a[key];
    const bVal = b[key];

    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;

    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });
  const jumpToTime = (t) => {
    videoRef.current.currentTime = t - 1;
  };
  const renderCell = (field, s, idx, prevRow = null) => {
    if (!visibleColumns[field]?.visible) return null;
    let highlightClass = 'border border-black hover:bg-gray-100';
    if (field === 'our_score' && prevRow && s[field] > prevRow[field]) {
      highlightClass = 'border border-black bg-green-100 text-green-800';
    } else if (field === 'opp_score' && prevRow && s[field] > prevRow[field]) {
      highlightClass = 'border border-black bg-red-100 text-red-800';
    }
    return (
      <td key={field} className={highlightClass}>
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
  };
  const formatTimestamp = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);

    if (mins === 0) {
      return ms > 0 ? `${secs}.${String(ms).padStart(2, '0')}` : `${secs}`;
    } else {
      const paddedSecs = String(secs).padStart(2, '0');
      const msPart = ms > 0 ? `.${String(ms).padStart(2, '0')}` : '';
      return `${mins}:${paddedSecs}${msPart}`;
    }
  };
  const renderHeaderCell = (label, key) => {
    const isTextColumn = visibleColumns[key]?.type === 'text';
    return (
      <th key={key} className="cursor-pointer hover:underline px-2 py-1 border-b border-black">
        <div onClick={() => handleHeaderClick(key)} className="flex items-center justify-between">
          <span>{label}</span>
          {sortConfig.key === key && (
            <span className="text-xs">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
          )}
        </div>
        {isTextColumn && (
          <input
            type="text"
            value={textColumnFilters[key] || ''}
            onChange={(e) => handleTextColumnFilterChange(key, e.target.value)}
            placeholder="Filter..."
            className="mt-1 w-full p-1 text-sm border border-gray-300 rounded"
          />
        )}
      </th>
    );
  };
  const NavToStats = () => {
    navigate('/stats');
  };
  if (isAppLoading) {
    return (
      <div className="flex flex-col h-[100svh] justify-center items-center">
        <div className="text-lg font-semibold mb-4">Loading...</div>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }    
  if (!isAppLoading && !teamName) {
    return (
      <div className="flex flex-col h-[100svh] justify-center items-center">
        <div className="text-lg font-semibold mb-4">Please select your team to begin</div>
        <StyledSelect
          options={availableTeams.map(team => ({
            label: team,
            value: team,
            color: 'blue', // or a color based on some logic
          }))}
          value={teamName}
          onChange={(selected) => handleTeamChange({ target: { value: selected.value } })}
          placeholder="Click here to select a team"
          showStatus={false}
        />
      </div>
    );
  }
  if (!isAppLoading && !selectedVideo) {
    return (
      <div className="flex flex-col h-[100svh] justify-center items-center">
        <div className="text-lg font-semibold mb-4">Please select a game to continue</div>
        <GameSelector
          games={teamGames}
          value={selectedGameId}
          onChange={(selectedOption) => {
            setSelectedGameId(selectedOption.value);
            const selectedGame = teamGames.find(g => g.id === selectedOption.value);
            setSelectedVideo(selectedGame?.video_url || '');
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100svh] overflow-hidden">
      <div
        className="flex flex-1 overflow-auto transition-all duration-300"
        style={{ paddingTop: "3.5rem" }}
      >
      <div
        className={`transition-all duration-300 overflow-hidden bg-gray-200 border-r h-full flex-shrink-0 ${
          showSidebar ? 'w-64' : 'w-0'
        }`}
      >
      <div className="h-full flex flex-col">    
        <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col h-full">
          <label className="font-semibold block mb-1 text-gray-800">Your Team:</label>
          <StyledSelect
            options={availableTeams.map(team => ({
              label: team,
              value: team,
              color: 'blue', // or a color based on some logic
            }))}
            value={teamName}
            onChange={(selected) => handleTeamChange({ target: { value: selected.value } })}
            placeholder="Click here to select a team"
            showStatus={false}
          /> 
          <div>
            <label className={`font-semibold ${!selectedGameId ? "text-blue-700" : ""}`}>
              {!selectedGameId ? "🎯 Select Game:" : "Select Game:"}
            </label>
            <GameSelector
              games={teamGames}
              value={selectedGameId}
              onChange={(selectedOption) => {
                setSelectedGameId(selectedOption.value);
                const selectedGame = teamGames.find(g => g.id === selectedOption.value);
                setSelectedVideo(selectedGame?.video_url || '');
                setTimeout(() => {
                  videoRef.current?.focus();
                }, 300);                
              }}
            />     
          </div>
          <div>
            <label className="font-semibold block mb-1">Display Layout:</label>
            <StyledSelect
              options={[
                { label: 'Stacked', value: 'stacked', color: 'orange' },
                { label: 'Side-by-Side', value: 'side-by-side', color: 'purple' },
              ]}
              value={layoutMode}
              onChange={(selected) => setLayoutMode(selected.value)}
              placeholder="Select layout"
              showStatus={false}
            />
          </div>
          <div>
            <label className="font-semibold block mb-1">Visible Columns:</label>
            <ColumnSelector
              columns={[
              { key: 'timestamp', label: 'Timestamp' },
              { key: 'set', label: 'Set' },
              { key: 'rally_id', label: 'Rally' },
              { key: 'posession_seq', label: 'Possession' },
              { key: 'player', label: 'Player' },
              { key: 'action_type', label: 'Action Type' },
              { key: 'quality', label: 'Quality' },
              { key: 'result', label: 'Transition' },
              { key: 'notes', label: 'Notes' },
              { key: 'score', label: 'Score' },
              ]}
              visibleColumns={visibleColumns}
              toggleColumn={toggleColumn}
            />
          </div>
          <div className="mt-auto p-4 space-y-4">
            <button
              onClick={handleEditModeLogin}
              className={`w-full px-3 py-2 rounded text-white ${
                isAdmin ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-800'
              }`}
            >
              {isAdmin ? 'Disable Admin Mode' : 'Enable Admin Mode'}
            </button>
            <button
              onClick={NavToStats}
              className={`w-full px-3 py-2 rounded text-white ${'bg-blue-400 hover:bg-blue-800'
              }`}
            >
              Statistic Matrix
            </button>
          </div>          
        </div>
      </div>
    </div>
    <div ref={mainContentRef} className="flex-1 overflow-y-auto p-4">
      {selectedVideo && (
        <div className={`flex gap-4 ${layoutMode === 'side-by-side' ? 'flex-row h-full' : 'flex-col-reverse'}`}>
          <div className={`${layoutMode === 'side-by-side' ? 'w-1/2' : 'w-full'} overflow-auto`}>
            <DBStats
              isAdmin={isAdmin}
              stats={stats}
              setStats={setStats}
              filteredStats={filteredStats}
              visibleColumns={visibleColumns}
              sortConfig={sortConfig}
              setSortConfig={setSortConfig}
              textColumnFilters={textColumnFilters}
              handleTextColumnFilterChange={handleTextColumnFilterChange}
              renderCell={renderCell}
              insertButtonParentRef={insertButtonParentRef}
              authorizedFetch={authorizedFetch}
              layoutMode={layoutMode}
              jumpToTime={jumpToTime}
              videoRef={videoRef}
              mainContentRef={mainContentRef}
              containerRef={containerRef}
              formatTimestamp={formatTimestamp}
              gameId={gameId}
            />
          </div>
          <div className={`${layoutMode === 'side-by-side' ? 'w-1/2' : 'w-full'}`}>
            <VideoPlayer
              ref={videoPlayerRef}
              selectedVideo={selectedVideo}
              videoRef={videoRef}
              containerRef={containerRef}
              stats={stats}
            />
          </div>
        </div>
      )}
    </div>
  </div>
</div>
);
};

export default MainPage;
