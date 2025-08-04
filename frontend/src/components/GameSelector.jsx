import React, { useState, useEffect } from 'react';
import StyledSelect from './StyledSelect';
import UploadGameModal from './UploadGameModal';
import supabase from '../supabaseClient';

const getStatusColor = (game) => {
  if (game.hastimestamps && game.isscored) return 'green';
  if (game.hastimestamps) return 'yellow';
  return 'red';
};

const GameSelector = ({ games, onChange, value, videoPlayerRef, teamName }) => {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [incompleteUploadData, setIncompleteUploadData] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);

  useEffect(() => {
    const fetchSessionAndScanUploads = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) {
        console.error('Failed to retrieve user session');
        return;
      }

      const userId = session.user.id;
      setCurrentUserId(userId);

      const incompleteUploads = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('tus::')) {
          try {
            const uploadData = JSON.parse(localStorage.getItem(key));
            if (uploadData?.metadata?.user_id === userId) {
              incompleteUploads.push({ key, ...uploadData });
            }
          } catch (e) {
            console.error('Error parsing tus entry:', e);
          }
        }
      }

      if (incompleteUploads.length > 0) {
        const latestUpload = incompleteUploads.sort((a, b) => 
          new Date(b.creationTime) - new Date(a.creationTime)
        )[0];

        setIncompleteUploadData(latestUpload.metadata);
        setShowUploadModal(true);
      }
    };

    fetchSessionAndScanUploads();
  }, [teamName]);
  
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
        incompleteUploadData={incompleteUploadData}
        userId={currentUserId}
      />
    </>
  );
};

export default GameSelector;
