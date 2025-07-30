import React from 'react';
import StyledSelect from './StyledSelect';

const getStatusColor = (game) => {
  if (game.hastimestamps && game.isscored) return 'green';
  if (game.hastimestamps) return 'yellow';
  return 'red';
};

const GameSelector = ({ games, onChange, value }) => {
  const options = games.map((game) => {
    const statusColor = getStatusColor(game);
    const tooltip = {
      green: 'All stats and timestamps present',
      yellow: 'Timestamps present, but no scores',
      red: 'No stats or timestamps',
    }[statusColor];

    return {
      value: game.id,
      label: game.title,
      color: statusColor,
      tooltip,
    };
  });

  return (
    <StyledSelect
      options={options}
      value={value}
      onChange={onChange}
      placeholder="Click here to select a game"
      showStatus
      showTooltip
    />
  );
};

export default GameSelector;
