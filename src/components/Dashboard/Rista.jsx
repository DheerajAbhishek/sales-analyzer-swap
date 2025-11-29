
import { useEffect, useState } from 'react';
import axios from 'axios';
import { RISTA_API_KEY, RISTA_SECRET_KEY, RISTA_API_URL } from '../../utils/constants';
import { SignJWT } from 'jose';


const DashboardRista = () => {
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchBranches = async () => {
        setLoading(true);
        setError(null);
        try {
            // Use jose for browser JWT signing
            const secret = new TextEncoder().encode(RISTA_SECRET_KEY);
            const token = await new SignJWT({})
                .setProtectedHeader({ alg: 'HS256' })
                .setIssuer(RISTA_API_KEY)
                .setIssuedAt()
                .sign(secret);

            const response = await axios.get(`${RISTA_API_URL}/branch/list`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            const branchesData = response.data;
            if (Array.isArray(branchesData) && branchesData.length > 0) {
                setBranches(branchesData);
            } else {
                setBranches([]);
                setError("No branches found for this API Key.");
            }
        } catch (err) {
            setError(err.response ? err.response.data : err.message);
            setBranches([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Optionally fetch on mount
        // fetchBranches();
    }, []);

    return (
        <div>
            <button type="button" onClick={fetchBranches} disabled={loading}>
                {loading ? "Loading..." : "Fetch Branches"}
            </button>
            {error && <div style={{ color: 'red', marginTop: '1em' }}>{error}</div>}
            {branches && branches.length > 0 ? (
                <ul style={{ marginTop: '1em' }}>
                    {branches.map((branch, i) => (
                        <li key={i}>{branch.name}</li>
                    ))}
                </ul>
            ) : (
                !loading && !error && <div style={{ marginTop: '1em' }}>No branches found.</div>
            )}
        </div>
    );
};

export default DashboardRista;

