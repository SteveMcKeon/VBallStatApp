import React, { useRef, useState, useEffect, useMemo } from 'react';
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
import SidebarFooter from './SidebarFooter';
import StatsSummary from './StatsSummary';
import UploadGameModal from './UploadGameModal';

const HEADER_HOVER_ZONE_PX = 50;

const MiniSidebar = ({ onExpand }) => {
  const handlePanelClick = () => onExpand();
  const stopPropagation = (e) => e.stopPropagation();

  return (
    <div
      onClick={handlePanelClick}
      className="h-full w-12 flex-shrink-0 cursor-e-resize flex flex-col items-center justify-between py-4 hover:bg-gray-100 transition-colors"
    >
      {/* Top: Expand */}
      <div onClick={stopPropagation}>
        <button
          onClick={onExpand}
          className="p-1 hover:bg-gray-200 rounded cursor-pointer"
          aria-label="Expand sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" data-rtl-flip=""><path d="M6.83496 3.99992C6.38353 4.00411 6.01421 4.0122 5.69824 4.03801C5.31232 4.06954 5.03904 4.12266 4.82227 4.20012L4.62207 4.28606C4.18264 4.50996 3.81498 4.85035 3.55859 5.26848L3.45605 5.45207C3.33013 5.69922 3.25006 6.01354 3.20801 6.52824C3.16533 7.05065 3.16504 7.71885 3.16504 8.66301V11.3271C3.16504 12.2712 3.16533 12.9394 3.20801 13.4618C3.25006 13.9766 3.33013 14.2909 3.45605 14.538L3.55859 14.7216C3.81498 15.1397 4.18266 15.4801 4.62207 15.704L4.82227 15.79C5.03904 15.8674 5.31234 15.9205 5.69824 15.9521C6.01398 15.9779 6.383 15.986 6.83398 15.9902L6.83496 3.99992ZM18.165 11.3271C18.165 12.2493 18.1653 12.9811 18.1172 13.5702C18.0745 14.0924 17.9916 14.5472 17.8125 14.9648L17.7295 15.1415C17.394 15.8 16.8834 16.3511 16.2568 16.7353L15.9814 16.8896C15.5157 17.1268 15.0069 17.2285 14.4102 17.2773C13.821 17.3254 13.0893 17.3251 12.167 17.3251H7.83301C6.91071 17.3251 6.17898 17.3254 5.58984 17.2773C5.06757 17.2346 4.61294 17.1508 4.19531 16.9716L4.01855 16.8896C3.36014 16.5541 2.80898 16.0434 2.4248 15.4169L2.27051 15.1415C2.03328 14.6758 1.93158 14.167 1.88281 13.5702C1.83468 12.9811 1.83496 12.2493 1.83496 11.3271V8.66301C1.83496 7.74072 1.83468 7.00898 1.88281 6.41985C1.93157 5.82309 2.03329 5.31432 2.27051 4.84856L2.4248 4.57317C2.80898 3.94666 3.36012 3.436 4.01855 3.10051L4.19531 3.0175C4.61285 2.83843 5.06771 2.75548 5.58984 2.71281C6.17898 2.66468 6.91071 2.66496 7.83301 2.66496H12.167C13.0893 2.66496 13.821 2.66468 14.4102 2.71281C15.0069 2.76157 15.5157 2.86329 15.9814 3.10051L16.2568 3.25481C16.8833 3.63898 17.394 4.19012 17.7295 4.84856L17.8125 5.02531C17.9916 5.44285 18.0745 5.89771 18.1172 6.41985C18.1653 7.00898 18.165 7.74072 18.165 8.66301V11.3271ZM8.16406 15.995H12.167C13.1112 15.995 13.7794 15.9947 14.3018 15.9521C14.8164 15.91 15.1308 15.8299 15.3779 15.704L15.5615 15.6015C15.9797 15.3451 16.32 14.9774 16.5439 14.538L16.6299 14.3378C16.7074 14.121 16.7605 13.8478 16.792 13.4618C16.8347 12.9394 16.835 12.2712 16.835 11.3271V8.66301C16.835 7.71885 16.8347 7.05065 16.792 6.52824C16.7605 6.14232 16.7073 5.86904 16.6299 5.65227L16.5439 5.45207C16.32 5.01264 15.9796 4.64498 15.5615 4.3886L15.3779 4.28606C15.1308 4.16013 14.8165 4.08006 14.3018 4.03801C13.7794 3.99533 13.1112 3.99504 12.167 3.99504H8.16406C8.16407 3.99667 8.16504 3.99829 8.16504 3.99992L8.16406 15.995Z"></path></svg>
        </button>
        <div className="h-px bg-gray-300 w-6 mx-auto" />
      </div>

      {/* Bottom: user icon/footer */}
      <div onClick={stopPropagation}>
        <SidebarFooter mini />
      </div>
    </div>
  );
};

const MainPage = () => {
  const navigate = useNavigate();
  const sidebarRef = useRef(null);

  const uploadModalRef = useRef();
  const [sidebarContent, setSidebarContent] = useState(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [resumeSilently, setResumeSilently] = useState(false);
  const handleOpenUploadModal = () => {
    requestAnimationFrame(() => {
      videoPlayerRef.current?.forceHideControls();
    });
    setIsUploadModalOpen(true);
  };
  const handleCloseUploadModal = () => {
    videoPlayerRef.current?.allowControls();
    setIsUploadModalOpen(false);
  };

  const handleResumeAllUploadsFromBanner = () => {
    setResumeSilently(true);
    setIsUploadModalOpen(true);
    uploadModalRef.current?.triggerResumeAllUploads?.();
    setShowResumeBanner(false);
  };

  const handleCancelAllUploadsFromBanner = async () => {
    if (uploadModalRef.current?.cancelUploads) {
      await uploadModalRef.current.cancelUploads();
    } else {
      console.warn('cancelUploads() not available on UploadGameModal ref');
    }
    setShowResumeBanner(false);
  };

  const [currentUserId, setCurrentUserId] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [showStatsView, setShowStatsView] = useState(false);

  useEffect(() => {
    const fetchSession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) {
        console.error('Failed to retrieve user session');
        return;
      }
      const userId = session.user.id;
      setCurrentUserId(userId);
    };
    fetchSession();
  }, [teamName]);
  const [incompleteUploadCount, setIncompleteUploadCount] = useState(0);

  useEffect(() => {
    if (!currentUserId) return;
    const scanIncompleteUploads = () => {
      const matches = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('tus::')) {
          try {
            const uploadData = JSON.parse(localStorage.getItem(key));
            if (uploadData?.metadata?.user_id === currentUserId) {
              matches.push({ key, ...uploadData });
            }
          } catch (e) {
            console.error('Error parsing tus entry:', e);
          }
        }
      }
      return matches;
    };
    const checkForIncompleteUpload = () => {
      const incomplete = scanIncompleteUploads();
      setIncompleteUploadCount(incomplete.length);
      setShowResumeBanner(incomplete.length > 0);
    };
    checkForIncompleteUpload();
    window.addEventListener('storage', checkForIncompleteUpload); // updates if another tab changes it
    return () => window.removeEventListener('storage', checkForIncompleteUpload);
  }, [currentUserId]);


  const [isAppLoading, setIsAppLoading] = useState(true);
  const videoPlayerRef = useRef(null);
  const [gamePlayers, setGamePlayers] = useState([]);
  const setLocal = (key, value) => localStorage.setItem(key, value);
  const getLocal = (key) => localStorage.getItem(key);
  const [availableTeams, setAvailableTeams] = useState([]);
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    const fetchUserRole = async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) {
        console.error('Failed to get user', error);
        return;
      }
      setUserRole(user?.user_metadata?.role);
    };
    fetchUserRole();
  }, []);

  const handleTeamChange = async (e) => {
    const selected = e.target.value;
    setTeamName(selected);
    setLocal('teamName', selected);
    setSelectedVideo('');
    setSelectedGameId('');
    const { data, error } = await supabase
      .from('games')
      .select('id, title, date, video_url, hastimestamps, isscored, processed')
      .eq('team_name', selected)
      .order('date', { ascending: false });
    if (error) {
      console.error("Error fetching games:", error);
    } else {
      setTeamGames(data);
    }
  };

  const refreshGames = async () => {
    if (!teamName) return;
    const { data, error } = await supabase
      .from('games')
      .select('id, title, date, video_url, hastimestamps, isscored, processed')
      .eq('team_name', teamName)
      .order('date', { ascending: false });
    if (error) {
      console.error("Error refreshing games:", error);
    } else {
      setTeamGames(data);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/login');
      }
    });
  }, [navigate]);

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
    setTextColumnFilters((prev) => {
      const next = { ...prev };
      const isEmpty =
        value == null ||
        (Array.isArray(value?.conditions) && value.conditions.length === 0);
      if (typeof value === 'string') {
        const operator = colType === 'text' ? 'contains' : 'equals';
        next[column] = { conditions: [{ operator, value }] };
      } else if (isEmpty) {
        delete next[column];
      } else {
        next[column] = value;
      }
      return next;
    });
    requestAnimationFrame(() =>
      window.dispatchEvent(new Event('db_layout_change'))
    );
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
  const { editMode, toggleEditMode, authorizedFetch } = EditMode();

  const handleEditModeToggle = () => {
    toggleEditMode();
  };

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
  const isMobile = useMemo(() => {
    const coarse = !window.matchMedia("(pointer: fine)").matches;
    const narrow = window.innerWidth < 768;
    return coarse && narrow;
  }, []);
  const handleMainInteract = () => {
    if (isUploadModalOpen) return;
    if (showSidebar && isMobile) {
      setShowSidebar(false);
      requestAnimationFrame(() => window.dispatchEvent(new Event('db_layout_change')));
    }
  };
  useEffect(() => {
    registerToggle(() => {
      setShowSidebar((prev) => {
        const next = !prev;
        requestAnimationFrame(() => window.dispatchEvent(new Event('db_layout_change')));
        return next;
      });
    });
  }, [registerToggle]);

  const [layoutMode, setLayoutMode] = useState(() => {
    try {
      return savedLayout ? decodeURIComponent(savedLayout) : 'stacked';
    } catch {
      return 'stacked';
    }
  });

  const [sortConfig, setSortConfig] = useState({ key: 'import_seq', direction: 'asc' });

  const defaultColumnConfig = {
    timestamp: { visible: false, type: 'float8' },
    set: { visible: false, type: 'int2' },
    rally_id: { visible: false, type: 'int2' },
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
    requestAnimationFrame(() => window.dispatchEvent(new Event('db_layout_change')));
  };

  const lastScrollY = useRef(0);
  const suppressScrollDetection = useRef(false);

  const loadStatsForSelectedVideo = async (videoUrl) => {
    if (!videoUrl) {
      setStats([]);
      return;
    }
    const { data: existing, error: existingError } = await supabase
      .from('games')
      .select('id')
      .eq('video_url', videoUrl)
      .single();
    if (existingError || !existing?.id) {
      console.error('Error checking for game:', existingError);
      setStats([]);
      return;
    }
    setGameId(existing.id);
    const { data: gameMeta, error: gameError } = await supabase
      .from('games')
      .select('players')
      .eq('id', existing.id)
      .single();

    if (gameError) {
      console.error('Error fetching game players:', gameError);
      setGamePlayers([]);
    } else {
      setGamePlayers(gameMeta?.players || []);
    }
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
  };

  useEffect(() => {
    loadStatsForSelectedVideo(selectedVideo);
  }, [selectedVideo]);

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
          .select('id, title, date, video_url, hastimestamps, isscored, processed')
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
        if (prev.direction === 'desc') return { key: 'import_seq', direction: 'asc' };
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

  const refreshStats = () => loadStatsForSelectedVideo(selectedVideo);

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
        let result = null;
        for (let i = 0; i < activeConditions.length; i++) {
          const cond = activeConditions[i];
          const condResult = evaluator(cond);
          if (result === null) {
            result = condResult;
          } else {
            const logic = cond.logic || 'AND';
            if (logic === 'AND') result = result && condResult;
            if (logic === 'OR') result = result || condResult;
          }
        }
        return result ?? true;
      })
    );

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
        {editMode ? (
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

  const handleSidebarToggle = (value) => {
    setShowSidebar(value);
    const fire = (tag) => {
      window.dispatchEvent(new Event('db_layout_change'));
      window.dispatchEvent(new Event('resize'));
    };
    requestAnimationFrame(() => fire('raf-start'));
    const el = sidebarRef.current;
    if (!el) return;
    const onEnd = (e) => {
      if (['width', 'transform', 'left'].includes(e.propertyName)) {
        requestAnimationFrame(() => fire('raf-transitionend-1'));
        requestAnimationFrame(() => fire('raf-transitionend-2'));
        el.removeEventListener('transitionend', onEnd);
      }
    };
    el.addEventListener('transitionend', onEnd);
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
            color: 'blue',
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
          key={teamGames.map(g => g.id + g.hastimestamps + g.isscored).join('-')}
          games={teamGames}
          value={selectedGameId}
          onChange={(selectedOption) => {
            if (selectedOption.value === 'upload-new') {
              handleOpenUploadModal();
            } else {
              setSelectedGameId(selectedOption.value);
              const selectedGame = teamGames.find(g => g.id === selectedOption.value);
              setSelectedVideo(selectedGame?.video_url || '');
              localStorage.removeItem('videoTime');
            }
          }}
          teamName={teamName}
          currentUserId={currentUserId}
          isUploadModalOpen={isUploadModalOpen}
          setIsUploadModalOpen={setIsUploadModalOpen}
          setResumeSilently={setResumeSilently}
          resumeSilently={resumeSilently}
          hideUploadOption={true}
        />
      </div>
    );
  }

  const selectedGame = teamGames.find(g => g.id === selectedGameId);

  return (
    <div className="flex flex-col h-[100svh] overflow-hidden">
      <div className="relative flex flex-1 overflow-hidden">
        {/* Mini rail: takes space only when big sidebar is hidden */}
        <div
          className={`
            relative flex-shrink-0 overflow-hidden
            transition-[width]
            ${showSidebar ? isMobile ? 'w-12' : 'w-0' : 'w-12'}
          `}
        >
          {!showSidebar && (
          <MiniSidebar
            onExpand={() => handleSidebarToggle(true)} 
          />
          )}
        </div>

        {/* Sliding full sidebar (overlay). GPU-accelerated transform only. */}
        <div
          ref={sidebarRef}
          className={`
            bg-gray-100 border-r border-gray-300 z-20
            transform-gpu will-change-transform transition-transform ease-out
            ${isMobile
              ? `absolute top-0 left-0 h-full w-64
            transform-gpu will-change-transform transition-transform duration-300 ease-out ${
                  showSidebar
                    ? 'translate-x-0'
                    : '-translate-x-[16.25rem] opacity-0 pointer-events-none'
                }`
              : `relative overflow-x-auto ${showSidebar ? 'w-64' : 'w-0'}`}
          `}
        >
      
          <div className="h-full flex flex-col">
            <div className="w-full">
              {/* Collapse button aligned right */}
              <div className="flex justify-end p-2">
                <button
                  onClick={() => handleSidebarToggle(false)}
                  className="p-1 hover:bg-gray-200 rounded cursor-pointer"
                  aria-label="Collapse sidebar"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" data-rtl-flip=""><path d="M6.83496 3.99992C6.38353 4.00411 6.01421 4.0122 5.69824 4.03801C5.31232 4.06954 5.03904 4.12266 4.82227 4.20012L4.62207 4.28606C4.18264 4.50996 3.81498 4.85035 3.55859 5.26848L3.45605 5.45207C3.33013 5.69922 3.25006 6.01354 3.20801 6.52824C3.16533 7.05065 3.16504 7.71885 3.16504 8.66301V11.3271C3.16504 12.2712 3.16533 12.9394 3.20801 13.4618C3.25006 13.9766 3.33013 14.2909 3.45605 14.538L3.55859 14.7216C3.81498 15.1397 4.18266 15.4801 4.62207 15.704L4.82227 15.79C5.03904 15.8674 5.31234 15.9205 5.69824 15.9521C6.01398 15.9779 6.383 15.986 6.83398 15.9902L6.83496 3.99992ZM18.165 11.3271C18.165 12.2493 18.1653 12.9811 18.1172 13.5702C18.0745 14.0924 17.9916 14.5472 17.8125 14.9648L17.7295 15.1415C17.394 15.8 16.8834 16.3511 16.2568 16.7353L15.9814 16.8896C15.5157 17.1268 15.0069 17.2285 14.4102 17.2773C13.821 17.3254 13.0893 17.3251 12.167 17.3251H7.83301C6.91071 17.3251 6.17898 17.3254 5.58984 17.2773C5.06757 17.2346 4.61294 17.1508 4.19531 16.9716L4.01855 16.8896C3.36014 16.5541 2.80898 16.0434 2.4248 15.4169L2.27051 15.1415C2.03328 14.6758 1.93158 14.167 1.88281 13.5702C1.83468 12.9811 1.83496 12.2493 1.83496 11.3271V8.66301C1.83496 7.74072 1.83468 7.00898 1.88281 6.41985C1.93157 5.82309 2.03329 5.31432 2.27051 4.84856L2.4248 4.57317C2.80898 3.94666 3.36012 3.436 4.01855 3.10051L4.19531 3.0175C4.61285 2.83843 5.06771 2.75548 5.58984 2.71281C6.17898 2.66468 6.91071 2.66496 7.83301 2.66496H12.167C13.0893 2.66496 13.821 2.66468 14.4102 2.71281C15.0069 2.76157 15.5157 2.86329 15.9814 3.10051L16.2568 3.25481C16.8833 3.63898 17.394 4.19012 17.7295 4.84856L17.8125 5.02531C17.9916 5.44285 18.0745 5.89771 18.1172 6.41985C18.1653 7.00898 18.165 7.74072 18.165 8.66301V11.3271ZM8.16406 15.995H12.167C13.1112 15.995 13.7794 15.9947 14.3018 15.9521C14.8164 15.91 15.1308 15.8299 15.3779 15.704L15.5615 15.6015C15.9797 15.3451 16.32 14.9774 16.5439 14.538L16.6299 14.3378C16.7074 14.121 16.7605 13.8478 16.792 13.4618C16.8347 12.9394 16.835 12.2712 16.835 11.3271V8.66301C16.835 7.71885 16.8347 7.05065 16.792 6.52824C16.7605 6.14232 16.7073 5.86904 16.6299 5.65227L16.5439 5.45207C16.32 5.01264 15.9796 4.64498 15.5615 4.3886L15.3779 4.28606C15.1308 4.16013 14.8165 4.08006 14.3018 4.03801C13.7794 3.99533 13.1112 3.99504 12.167 3.99504H8.16406C8.16407 3.99667 8.16504 3.99829 8.16504 3.99992L8.16406 15.995Z"></path></svg>
                </button>
              </div>
              <div className="h-px bg-gray-300 mx-2" />
            </div>

            {sidebarContent ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col h-full">
                {sidebarContent}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col h-full">
                <label className="font-semibold block mb-1 text-gray-800">Your Team:</label>
                <StyledSelect
                  options={availableTeams.map(team => ({
                    label: team,
                    value: team,
                    color: 'blue',
                  }))}
                  value={teamName}
                  onChange={(selected) => handleTeamChange({ target: { value: selected.value } })}
                  placeholder="Click here to select a team"
                  showStatus={false}
                />
                <div>
                  <label className={`font-semibold block mb-1 ${!selectedGameId ? "text-blue-700" : ""}`}>
                    {!selectedGameId ? "🎯 Select Game:" : "Select Game:"}
                  </label>
                  <GameSelector
                    games={teamGames}
                    value={selectedGameId}
                    onChange={(selectedOption) => {
                      if (selectedOption.value === 'upload-new') {
                        handleOpenUploadModal();
                      } else {
                        setSelectedGameId(selectedOption.value);
                        const selectedGame = teamGames.find(g => g.id === selectedOption.value);
                        setSelectedVideo(selectedGame?.video_url || '');
                        localStorage.removeItem('videoTime');
                        setTimeout(() => {
                          videoRef.current?.focus();
                        }, 300);
                      }
                    }}
                    videoPlayerRef={videoPlayerRef}
                    teamName={teamName}
                    currentUserId={currentUserId}
                    isUploadModalOpen={isUploadModalOpen}
                    setIsUploadModalOpen={setIsUploadModalOpen}
                    setResumeSilently={setResumeSilently}
                    resumeSilently={resumeSilently}
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
                    onChange={(selected) => {
                      setLayoutMode(selected.value);
                      const ping = () => {
                        window.dispatchEvent(new Event('db_layout_change'));
                        window.dispatchEvent(new Event('resize'));
                      };
                      requestAnimationFrame(() => requestAnimationFrame(ping));
                      setTimeout(ping, 300);
                    }}
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
                      { key: 'player', label: 'Player' },
                      { key: 'action_type', label: 'Action Type' },
                      { key: 'quality', label: 'Quality' },
                      { key: 'result', label: 'Result' },
                      { key: 'score', label: 'Score' },
                      { key: 'notes', label: 'Notes' },
                    ]}
                    visibleColumns={visibleColumns}
                    toggleColumn={toggleColumn}
                  />
                </div>
                <div className="mt-auto p-4 space-y-4">
                  {userRole && (
                    <button
                      onClick={handleEditModeToggle}
                      className={`w-full px-4 py-2 rounded-xl text-white font-semibold shadow-md transform cursor-pointer transition hover:scale-[1.03] ${
                        editMode
                          ? 'bg-gradient-to-r from-red-500 to-red-700 hover:from-red-600 hover:to-red-800'
                          : 'bg-gradient-to-r from-green-500 to-green-700 hover:from-green-600 hover:to-green-800'
                      }`}
                    >
                      {editMode ? 'Exit Edit Mode' : 'Enter Edit Mode'}
                    </button>
                  )}
                  <button
                    onClick={() => setShowStatsView(true)}
                    className="w-full px-4 py-2 cursor-pointer rounded-xl text-white font-semibold shadow-md transform transition hover:scale-[1.03] bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800"
                  >
                    Statistic Matrix
                  </button>
                </div>
              </div>
            )}
            <SidebarFooter />
          </div>
        </div>
        <div
          ref={mainContentRef}
          onPointerDown={handleMainInteract}
          onFocusCapture={handleMainInteract}
         className={`relative flex-1 overflow-y-auto transform-gpu will-change-transform transition-transform duration-300 ease-out
           ${editMode ? 'bg-yellow-50 transition-colors' : ''}`}
        >
          <div className="h-full">
            {showStatsView ? (
              <StatsSummary onBack={() => setShowStatsView(false)} setSidebarContent={setSidebarContent} />
            ) : selectedVideo ? (
              <div className={`flex ${layoutMode === 'side-by-side' ? 'flex-row h-full' : 'flex-col-reverse'}`}>
                <div className={`${editMode ? 'bg-yellow-50 transition-colors' : ''} ${layoutMode === 'side-by-side' ? 'w-1/2' : 'px-4 w-full'} overflow-auto`}>
                  <div className="bg-white w-full">
                    <DBStats
                      canEdit={editMode === 'admin' || editMode === 'editor'}
                      editMode={editMode}
                      hastimestamps={selectedGame?.hastimestamps}
                      isscored={selectedGame?.isscored}
                      stats={stats}
                      refreshStats={refreshStats}
                      setStats={setStats}
                      filteredStats={sortedStats}
                      gamePlayers={gamePlayers}
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
                      videoPlayerRef={videoPlayerRef}
                      mainContentRef={mainContentRef}
                      containerRef={containerRef}
                      formatTimestamp={formatTimestamp}
                      gameId={gameId}
                      refreshGames={refreshGames}
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
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {showResumeBanner && (
        <div
          className={`fixed top-0 left-0 right-0 bg-yellow-100 text-yellow-900 p-3 z-50 shadow
            ${isMobile ? 'flex flex-col gap-2' : 'flex items-center justify-between'}`}
        >
          <span className={isMobile ? 'text-center' : 'text-left'}>
            {incompleteUploadCount > 1
              ? `You have ${incompleteUploadCount} incomplete uploads.`
              : 'You have an incomplete upload.'}
          </span>

          <div className={`${isMobile ? 'flex w-full justify-end gap-2' : 'flex gap-2'}`}>
            <button
              onClick={handleResumeAllUploadsFromBanner}
              className="bg-blue-600 text-white px-3 py-1 rounded"
            >
              {`Resume Upload${incompleteUploadCount > 1 ? 's' : ''}`}
            </button>
            <button
              onClick={handleCancelAllUploadsFromBanner}
              className="bg-red-600 text-white px-3 py-1 rounded"
            >
              {`Cancel Upload${incompleteUploadCount > 1 ? 's' : ''}`}
            </button>
            <button
              onClick={() => setShowResumeBanner(false)}
              className="bg-gray-300 px-3 py-1 rounded"
            >
              Dismiss Banner
            </button>
          </div>
        </div>
      )}

      <UploadGameModal
        ref={uploadModalRef}
        isOpen={isUploadModalOpen}
        onBeforeOpen={() => videoPlayerRef?.current?.closeControlsOverlay?.()}
        onClose={() => {
          setIsUploadModalOpen(false);
          setResumeSilently(false);
        }}
        teamName={teamName}
        userId={currentUserId}
        resumeSilently={resumeSilently}
      />
    </div>
  );
};

export default MainPage;