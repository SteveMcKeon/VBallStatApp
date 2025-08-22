import React, { useState, useMemo } from 'react';
import Modal from './Modal';
import ManageTeamModal from './ManageTeamModal';

const TeamIcon = () => (
    <svg height="20" width="20" fill="currentColor" viewBox="0 0 100 100" aria-hidden="true">
        <path d="M57,44h-6h-6c-3.3,0-6,2.7-6,6v9c0,1.1,0.5,2.1,1.2,2.8c0.7,0.7,1.7,1.2,2.8,1.2v9c0,3.3,2.7,6,6,6h2h2 c3.3,0,6-2.7,6-6v-9c1.1,0,2.1-0.4,2.8-1.2c0.7-0.7,1.2-1.7,1.2-2.8v-9C63,46.7,60.3,44,57,44z"></path>
        <circle cx="51" cy="33" r="7"></circle>
        <path d="M36.6,66.7c-0.2-0.2-0.5-0.4-0.7-0.6c-1.9-2-3-4.5-3-7.1v-9c0-3.2,1.3-6.2,3.4-8.3c0.6-0.6,0.1-1.7-0.7-1.7c-1.7,0-3.6,0-3.6,0h-6c-3.3,0-6,2.7-6,6v9c0,1.1,0.5,2.1,1.2,2.8c0.7,0.7,1.7,1.2,2.8,1.2v9c0,3.3,2.7,6,6,6h2h2c0.9,0,1.7-0.2,2.4-0.5c0.4-0.2,0.6-0.5,0.6-0.9c0-1.2,0-4,0-5.1C37,67.2,36.9,66.9,36.6,66.7z"></path>
        <circle cx="32" cy="29" r="7"></circle>
        <path d="M76,40h-6c0,0-1.9,0-3.6,0c-0.9,0-1.3,1-0.7,1.7c2.1,2.2,3.4,5.1,3.4,8.3v9c0,2.6-1,5.1-3,7.1c-0.2,0.2-0.4,0.4-0.7,0.6c-0.2,0.2-0.4,0.5-0.4,0.8c0,1.1,0,3.8,0,5.1c0,0.4,0.2,0.8,0.6,0.9c0.7,0.3,1.5,0.5,2.4,0.5h2h2c3.3,0,6-2.7,6-6v-9c1.1,0,2.1-0.4,2.8-1.2c0.7-0.7,1.2-1.7,1.2-2.8v-9C82,42.7,79.3,40,76,40z"></path>
        <circle cx="70" cy="29" r="7"></circle>
    </svg>
);

const ProfileIcon = () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon" aria-hidden="true">
        <path d="M16.585 10C16.585 6.3632 13.6368 3.41504 10 3.41504C6.3632 3.41504 3.41504 6.3632 3.41504 10C3.41504 11.9528 4.26592 13.7062 5.61621 14.9121C6.6544 13.6452 8.23235 12.835 10 12.835C11.7674 12.835 13.3447 13.6454 14.3828 14.9121C15.7334 13.7062 16.585 11.9531 16.585 10ZM10 14.165C8.67626 14.165 7.49115 14.7585 6.69531 15.6953C7.66679 16.2602 8.79525 16.585 10 16.585C11.2041 16.585 12.3316 16.2597 13.3027 15.6953C12.5069 14.759 11.3233 14.1651 10 14.165ZM11.835 8.5C11.835 7.48656 11.0134 6.66504 10 6.66504C8.98656 6.66504 8.16504 7.48656 8.16504 8.5C8.16504 9.51344 8.98656 10.335 10 10.335C11.0134 10.335 11.835 9.51344 11.835 8.5ZM17.915 10C17.915 14.3713 14.3713 17.915 10 17.915C5.62867 17.915 2.08496 14.3713 2.08496 10C2.08496 5.62867 5.62867 2.08496 10 2.08496C14.3713 2.08496 17.915 5.62867 17.915 10ZM13.165 8.5C13.165 10.248 11.748 11.665 10 11.665C8.25202 11.665 6.83496 10.248 6.83496 8.5C6.83496 6.75202 8.25202 5.33496 10 5.33496C11.748 5.33496 13.165 6.75202 13.165 8.5Z"></path>
    </svg>
);

const BellIcon = () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon" aria-hidden="true">
        <path d="M10.0004 2.04329C13.4217 2.04348 16.2944 4.61968 16.6655 8.02083L17.227 13.1712L17.2358 13.3353C17.2361 14.1509 16.5738 14.8313 15.7377 14.8314H13.9018C13.5034 16.6195 11.9085 17.9562 10.0004 17.9564C8.09213 17.9564 6.49643 16.6196 6.09808 14.8314H4.26214C3.37065 14.8311 2.67643 14.0575 2.77288 13.1712L3.3344 8.02083L3.37737 7.70442C3.88652 4.4611 6.68591 2.04329 10.0004 2.04329ZM7.48089 14.8314C7.8428 15.8758 8.83285 16.6263 10.0004 16.6263C11.1678 16.6261 12.1571 15.8757 12.519 14.8314H7.48089ZM10.0004 3.37337C7.34338 3.37337 5.09898 5.31147 4.69085 7.91145L4.65667 8.16536L4.09515 13.3148C4.08429 13.4142 4.16215 13.5011 4.26214 13.5013H15.7377C15.8252 13.5012 15.8956 13.4351 15.9047 13.3519V13.3148L15.3432 8.16536C15.0458 5.43888 12.743 3.37356 10.0004 3.37337Z"></path>
    </svg>
);

const TabButton = ({ active, onClick, Icon, children }) => (
    <button
        onClick={onClick}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left cursor-pointer
      ${active ? 'bg-gray-200 font-semibold' : 'hover:bg-gray-100'}`}
    >
        <span className="text-gray-700"><Icon /></span>
        <span>{children}</span>
    </button>
);

const SettingsModal = ({
    isOpen,
    onClose,
    teamId,
    currentUserId,
    canManage,
    isMobile,
}) => {
    const [tab, setTab] = useState('team');

    if (isMobile) {
        const [teamOpen, setTeamOpen] = useState(false);
        const [profileOpen, setProfileOpen] = useState(false);
        const [notifOpen, setNotifOpen] = useState(false);

        return (
            <>
                <Modal
                    isOpen={isOpen}
                    onClose={onClose}
                    contentClassName="bg-white p-4 rounded-2xl shadow-xl relative p-0 w-[360px] max-w-[95vw] overflow-hidden"
                >
                    <div className="space-y-2">
                        <TabButton active={false} onClick={() => setTeamOpen(true)} Icon={TeamIcon}>
                            Team
                        </TabButton>
                        <TabButton active={false} onClick={() => setProfileOpen(true)} Icon={ProfileIcon}>
                            Profile
                        </TabButton>
                        <TabButton active={false} onClick={() => setNotifOpen(true)} Icon={BellIcon}>
                            Notifications
                        </TabButton>
                    </div>
                </Modal>

                {/* Sub-modals (embedded = false) */}
                <ManageTeamModal
                    isOpen={teamOpen}
                    onClose={() => setTeamOpen(false)}
                    teamId={teamId}
                    currentUserId={currentUserId}
                    canManage={canManage}
                    embedded={false}
                />

                <Modal
                    isOpen={profileOpen}
                    onClose={() => setProfileOpen(false)}
                    contentClassName="bg-white rounded-2xl shadow-xl relative w-[360px] max-w-[95vw] p-6"
                >
                    <h3 className="text-lg font-semibold mb-2">Profile</h3>
                    <p className="text-sm text-gray-600">(Coming soon.)</p>
                </Modal>

                <Modal
                    isOpen={notifOpen}
                    onClose={() => setNotifOpen(false)}
                    contentClassName="bg-white rounded-2xl shadow-xl relative w-[360px] max-w-[95vw] p-6"
                >
                    <h3 className="text-lg font-semibold mb-2">Notifications</h3>
                    <p className="text-sm text-gray-600">(Coming soon.)</p>
                </Modal>
            </>
        );
    }

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            closeXLeft
            contentClassName="bg-white rounded-xl shadow-xl relative p-0 w-[680px] max-w-[95vw] overflow-hidden"
        >
            <div className="flex h-[600px] max-h-[600px]">
                {/* Left rail */}
                <aside className="w-[180px] shrink-0 border-r border-gray-200 px-4 pt-12 pb-4">
                    <div className="space-y-1">
                        <TabButton active={tab === 'team'} onClick={() => setTab('team')} Icon={TeamIcon}>Team</TabButton>
                        <TabButton active={tab === 'profile'} onClick={() => setTab('profile')} Icon={ProfileIcon}>Profile</TabButton>
                        <TabButton active={tab === 'notifications'} onClick={() => setTab('notifications')} Icon={BellIcon}>Notifications</TabButton>
                    </div>
                </aside>

                {/* Right content */}
                <section className="w-[500px] py-4 pl-4 pr-2 min-w-0 overflow-y-auto db-list-outer rounded-r-2xl"
                    style={{ scrollbarGutter: 'stable' }}
                >
                    {tab === 'team' && (
                        <ManageTeamModal
                            embedded
                            isOpen
                            teamId={teamId}
                            currentUserId={currentUserId}
                            canManage={canManage}
                            onClose={onClose}
                        />
                    )}
                    {tab === 'profile' && (
                        <div className="text-sm text-gray-600">
                            <h3 className="text-xl font-semibold mb-2">Profile</h3>
                            <p>(Coming soon.)</p>
                        </div>
                    )}
                    {tab === 'notifications' && (
                        <div className="text-sm text-gray-600">
                            <h3 className="text-xl font-semibold mb-2">Notifications</h3>
                            <p>(Coming soon.)</p>
                        </div>
                    )}
                </section>
            </div>
        </Modal>
    );
};

export default SettingsModal;
