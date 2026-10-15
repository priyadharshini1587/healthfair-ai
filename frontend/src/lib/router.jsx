import React, { createContext, useContext, useState, useEffect } from 'react';

const RouterContext = createContext(null);

export function BrowserRouter({ children }) {
  const [pathname, setPathname] = useState(window.location.pathname || '/');

  useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname || '/');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (to) => {
    if (to !== pathname) {
      window.history.pushState({}, '', to);
      setPathname(to);
      window.scrollTo(0, 0);
    }
  };

  return (
    <RouterContext.Provider value={{ pathname, navigate }}>
      {children}
    </RouterContext.Provider>
  );
}

export function useNavigate() {
  const ctx = useContext(RouterContext);
  if (!ctx) return () => {};
  return ctx.navigate;
}

export function useLocation() {
  const ctx = useContext(RouterContext);
  return { pathname: ctx ? ctx.pathname : window.location.pathname };
}

export function Link({ to, children, className = '', ...props }) {
  const navigate = useNavigate();
  return (
    <a
      href={to}
      onClick={(e) => {
        e.preventDefault();
        navigate(to);
      }}
      className={className}
      {...props}
    >
      {children}
    </a>
  );
}

export function NavLink({ to, children, className, end, ...props }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isActive = end ? pathname === to : pathname.startsWith(to);
  const resolvedClass = typeof className === 'function' ? className({ isActive }) : className;

  return (
    <a
      href={to}
      onClick={(e) => {
        e.preventDefault();
        navigate(to);
      }}
      className={resolvedClass}
      {...props}
    >
      {children}
    </a>
  );
}

export function Routes({ children }) {
  const { pathname } = useLocation();
  let matchedElement = null;

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const { path, element } = child.props;
    if (path === pathname || (path !== '/' && pathname.startsWith(path))) {
      matchedElement = element;
    } else if (path === '/' && pathname === '/') {
      matchedElement = element;
    }
  });

  return matchedElement || children[0]?.props?.element || null;
}

export function Route({ path, element }) {
  return null;
}

export function Outlet() {
  return null;
}
