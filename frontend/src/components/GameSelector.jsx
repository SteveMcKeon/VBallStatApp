import React, { useState } from 'react';
import StyledSelect from './StyledSelect';
import UploadGameModal from './UploadGameModal';

const getStatusColor = (game) => {
  if (game.hastimestamps && game.isscored) return 'green';
  if (game.hastimestamps) return 'yellow';
  return 'red';
};

const GameSelector = ({ games, onChange, value, videoPlayerRef, teamName }) => {
  const [showUploadModal, setShowUploadModal] = useState(false);
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

  options.push({
    value: 'upload-new',
    label: <em>Upload New Game...</em>,
  });

  const handleChange = (selected) => {
    if (selected.value === 'upload-new') {
      setShowUploadModal(true);
    } else {
      onChange(selected);
    }
  };

  return (
    <>
      <StyledSelect
        options={options}
        value={value}
        onChange={handleChange}
        placeholder="Click here to select a game"
        showStatus
        showTooltip
      />
      <UploadGameModal
        isOpen={showUploadModal}
        onBeforeOpen={() => videoPlayerRef?.current?.closeControlsOverlay?.()}
        onClose={() => setShowUploadModal(false)}
        teamName={teamName}
      />
    </>
  );
};

export default GameSelector;
