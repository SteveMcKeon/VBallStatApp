import React, { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import Toast from './Toast';
import supabase from '../supabaseClient';
const Avatar = ({ src, label, size = 72 }) => {
    const initial = (label?.trim()?.[0] || 'U').toUpperCase();
    const cls = size >= 72 ? 'w-18 h-18 text-2xl' : 'w-8 h-8 text-sm';
    return src ? (
        <img
            src={src}
            alt={label || 'User'}
            className={`${cls} rounded-full object-cover shrink-0 border border-gray-200`}
            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/default-avatar.png'; }}
            style={{ width: size, height: size }}
        />
    ) : (
        <div
            className={`rounded-full bg-gray-200 text-gray-700 flex items-center justify-center font-semibold shrink-0 border border-gray-200`}
            style={{ width: size, height: size }}
        >
            {initial}
        </div>
    );
};
export default function ManageProfileModal({
    isOpen,
    onClose,
    embedded = false,
}) {
    const actuallyOpen = embedded ? true : isOpen;
    const [busy, setBusy] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [toastType, setToastType] = useState('error');
    const [showToast, setShowToast] = useState(false);
    const setToast = (message, type = 'error') => {
        setToastMessage(message);
        setToastType(type);
        setShowToast(true);
    };
    // Current user
    const [user, setUser] = useState(null);
    const [displayName, setDisplayName] = useState('');
    const [phone, setPhone] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [pendingPhone, setPendingPhone] = useState('');
    const [otp, setOtp] = useState('');
    const fileInputRef = useRef(null);
    const preferredName = useMemo(() => {
        const md = user?.user_metadata || {};
        return (
            md.display_name ||
            md.full_name ||
            md.name ||
            user?.email ||
            ''
        );
    }, [user]);
    useEffect(() => {
        if (!actuallyOpen) return;
        (async () => {
            const { data: { user: u } } = await supabase.auth.getUser();
            setUser(u || null);
            const md = u?.user_metadata || {};
            setDisplayName(md.display_name || md.full_name || md.name || '');
            setPhone(u?.phone || md.phone || '');
            setAvatarUrl(md.avatar_url || md.picture || '');
            setPendingPhone('');
            setOtp('');
        })();
    }, [actuallyOpen]);
    const onPickAvatar = () => fileInputRef.current?.click();
    const uploadAvatar = async (file) => {
        if (!user || !file) return;
        const ext = (file.name?.split('.')?.pop() || 'png').toLowerCase();
        const path = `${user.id}/avatar.${ext}`;
        setBusy(true);
        try {
            const { error: upErr } = await supabase
                .storage
                .from('avatars')
                .upload(path, file, { upsert: true });
            if (upErr) throw upErr;
            const { data: pub } = supabase
                .storage
                .from('avatars')
                .getPublicUrl(path);
            const url = pub?.publicUrl ? `${pub.publicUrl}?t=${Date.now()}` : '';
            if (!url) throw new Error('Could not get public URL.');
            const { error: updErr } = await supabase.auth.updateUser({
                data: { avatar_url: url },
            });
            if (updErr) throw updErr;
            setAvatarUrl(url);
            setToast('Profile photo updated', 'success');
        } catch (e) {
            setToast(e?.message || 'Failed to upload avatar');
        } finally {
            setBusy(false);
        }
    };
    const clearAvatar = async () => {
        if (!user) return;
        setBusy(true);
        try {
            const { error } = await supabase.auth.updateUser({
                data: { avatar_url: null, picture: null },
            });
            if (error) throw error;
            setAvatarUrl('');
            setToast('Profile photo removed', 'success');
        } catch (e) {
            setToast(e?.message || 'Failed to remove photo');
        } finally {
            setBusy(false);
        }
    };
    const saveNameOnly = async () => {
        setBusy(true);
        try {
            const trimmed = (displayName || '').trim();
            const { error } = await supabase.auth.updateUser({
                data: {
                    display_name: trimmed || null,
                    full_name: trimmed || null,
                    name: trimmed || null,
                },
            });
            if (error) throw error;
            setToast('Display name saved', 'success');
        } catch (e) {
            setToast(e?.message || 'Failed to save display name');
        } finally {
            setBusy(false);
        }
    };
    const startPhoneUpdate = async () => {
        if (!phone?.trim()) return;
        setBusy(true);
        try {
            const { data, error } = await supabase.auth.updateUser({
                phone: phone.trim(),
                data: { phone: phone.trim() },
            });
            if (error) throw error;
            setPendingPhone(phone.trim());
            setToast('Verification code sent (if SMS is enabled). Check your phone.', 'success');
        } catch (e) {
            setToast(e?.message || 'Failed to start phone verification');
        } finally {
            setBusy(false);
        }
    };
    const verifyPhoneOtp = async () => {
        if (!pendingPhone || !otp?.trim()) return;
        setBusy(true);
        try {
            const { error } = await supabase.auth.verifyOtp({
                phone: pendingPhone,
                token: otp.trim(),
                type: 'phone_change',
            });
            if (error) throw error;
            setToast('Phone verified', 'success');
            setPendingPhone('');
            setOtp('');
        } catch (e) {
            setToast(e?.message || 'Invalid code');
        } finally {
            setBusy(false);
        }
    };
    const body = (
        <>
            <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">My Profile</h2>
                <p className="text-sm text-gray-600">Update your display name and profile photo.</p>
            </div>
            {/* Avatar */}
            <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Profile photo</label>
                <div className="flex items-center gap-4">
                    <Avatar src={avatarUrl} label={preferredName} size={72} />
                    <div className="flex gap-2">
                        <button
                            onClick={onPickAvatar}
                            disabled={busy}
                            className="px-3 py-2 bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50 cursor-pointer"
                            type="button"
                        >
                            Upload new…
                        </button>
                        <button
                            onClick={clearAvatar}
                            disabled={busy || !avatarUrl}
                            className="px-3 py-2 rounded-md border hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
                            type="button"
                        >
                            Remove
                        </button>
                    </div>
                    <input
                        type="file"
                        accept="image/*"
                        hidden
                        ref={fileInputRef}
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadAvatar(file);
                            e.target.value = '';
                        }}
                    />
                </div>
                <p className="mt-2 text-xs text-gray-500">Recommended: square image, ≥ 256×256px.</p>
            </div>
            {/* Display name */}
            <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Display name</label>
                <div className="flex gap-2">
                    <input
                        className="flex-1 border rounded-md px-3 py-2"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Your name"
                    />
                    <button
                        onClick={saveNameOnly}
                        disabled={busy}
                        className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50 cursor-pointer"
                    >
                        Save
                    </button>
                </div>
            </div>
            {/* Phone */}
            {/*
            <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <div className="flex gap-2">
                    <input
                        className="flex-1 border rounded-md px-3 py-2"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+1 555 555 5555"
                    />
                    <button
                        onClick={startPhoneUpdate}
                        disabled={busy || !phone?.trim()}
                        className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50 cursor-pointer"
                    >
                        Update
                    </button>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                    You may receive a verification code if SMS is enabled for your project.
                </p>
                {pendingPhone && (
                    <div className="mt-3 flex items-end gap-2">
                        <div className="flex-1">
                            <label className="block text-xs text-gray-600 mb-1">
                                Enter verification code sent to {pendingPhone}
                            </label>
                            <input
                                className="w-full border rounded-md px-3 py-2"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value)}
                                placeholder="6-digit code"
                            />
                        </div>
                        <button
                            onClick={verifyPhoneOtp}
                            disabled={busy || !otp?.trim()}
                            className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50 cursor-pointer"
                        >
                            Verify
                        </button>
                    </div>
                )}
            </div>
            */}
            {/* Footer */}
            {!embedded && (
                <div className="mt-6 flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 cursor-pointer">
                        Done
                    </button>
                </div>
            )}
            <Toast
                message={toastMessage}
                show={showToast}
                onClose={() => setShowToast(false)}
                type={toastType}
            />
        </>
    );
    if (embedded) {
        return <div className="max-w-2xl pr-2">{body}</div>;
    }
    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            {body}
        </Modal>
    );
}