import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';

const TooltipPortal = ({ children }) => {
  const [tooltipContainer, setTooltipContainer] = useState(null);

  useEffect(() => {
    const el = document.createElement('div');
    el.className = 'z-[1000] pointer-events-none';
    document.body.appendChild(el);
    setTooltipContainer(el);

    return () => {
      document.body.removeChild(el);
    };
  }, []);

  if (!tooltipContainer) return null;
  return createPortal(children, tooltipContainer);
};

export default TooltipPortal;
