import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiFetch, setToken } from "../lib/api";
import {
  getStoredPrivateKeyJwk,
  getStoredPublicKeyJwk,
  generateKeyPair,
  exportPrivateKeyJwk,
  exportPublicKeyJwk,
  storeKeyPair,
} from "../lib/e2e";
import { usePushNotifications } from "./usePushNotifications";

const AuthContext = createContext(null);

async function initializeKeys() {
  try {
    const existingPrivate = getStoredPrivateKeyJwk();
    const existingPublic = getStoredPublicKeyJwk();
    if (existingPrivate && existingPublic) {
      await apiFetch("/users/public-key", {
        method: "PUT",
        body: JSON.stringify({ public_key: existingPublic }),
      }).catch(() => {});
      return;
    }
    const keyPair = await generateKeyPair();
    const privateJwk = await exportPrivateKeyJwk(keyPair.privateKey);
    const publicJwk = await exportPublicKeyJwk(keyPair.publicKey);
    storeKeyPair(privateJwk, publicJwk);
    await apiFetch("/users/public-key", {
      method: "PUT",
      body: JSON.stringify({ public_key: publicJwk }),
    }).catch(() => {});
  } catch {
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const u = await apiFetch("/api/auth/user");
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  const login = async (email, password) => {
    const data = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    const { token, ...user } = data;
    setUser(user);
    initializeKeys();
    return user;
  };

  const register = async (email, password, firstName, lastName) => {
    const data = await apiFetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, first_name: firstName, last_name: lastName }),
    });
    if (data.token) {
      setToken(data.token);
      const { token, ...user } = data;
      setUser(user);
      initializeKeys();
    }
    return data;
  };

  const verifyEmail = async (email, code) => {
    const data = await apiFetch("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    });
    setToken(data.token);
    const { token, ...user } = data;
    setUser(user);
    initializeKeys();
    return user;
  };

  const logout = async () => {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setToken(null);
    setUser(null);
  };

  const refreshUser = fetchUser;

  usePushNotifications(!!user);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, verifyEmail, logout, refreshUser, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
