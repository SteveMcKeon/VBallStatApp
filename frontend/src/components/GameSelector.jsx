import { useEffect, useRef } from 'react';
import StyledSelect from './StyledSelect';
const getStatusColor = (game) => {
  if (game.hastimestamps && game.isscored) return 'green';
  if (game.hastimestamps) return 'yellow';
  return 'red';
};
const GameSelector = ({ games, onChange, value, videoPlayerRef, teamName, currentUserId, isUploadModalOpen, setIsUploadModalOpen, setResumeSilently, resumeSilently, hideUploadOption = false }) => {
  const processedGames = games.filter((game) => game.processed);
  const options = processedGames.map((game) => ({
    value: game.id,
    label: game.title,
    color: getStatusColor(game),
    tooltip: {
      green: 'All stats and timestamps present',
      yellow: 'Timestamps present, but no scores',
      red: 'No stats or timestamps',
    }[getStatusColor(game)],
  }));

  if (!hideUploadOption) {
    options.push({
      value: 'upload-new',
      label: <em>Upload New Game...</em>,
    });
  }

  const modalRef = useRef();

  const handleChange = (selected) => {
    if (selected.value === 'upload-new') {
      setResumeSilently(false);
      setIsUploadModalOpen(true);
    } else {
      onChange(selected);
    }
  };

  useEffect(() => {
    if (resumeSilently && isUploadModalOpen && modalRef.current) {
      modalRef.current.triggerResumeAllUploads();
    }
  }, [resumeSilently, isUploadModalOpen]);

  return (
    <>
      <StyledSelect
        options={options}
        value={value}
        onChange={handleChange}
        placeholder="Select a game..."
        showStatus
        showTooltip
      />
    </>
  );
};
export default GameSelector;
