'use client'

export default function AgentPage() {
  return (
    <main style={{background:'#0a0a0a',minHeight:'100vh',
    color:'white',padding:'40px 20px',fontFamily:'Inter,sans-serif'}}>
      <h1 style={{fontSize:'28px',fontWeight:'bold',marginBottom:'8px'}}>
         AI Agent Dashboard
      </h1>
      <p style={{color:'#888',marginBottom:'32px'}}>
        Autonomous market creation on X Layer Mainnet
      </p>
      <div style={{background:'#111',border:'1px solid #222',
      borderRadius:'12px',padding:'24px',marginBottom:'16px'}}>
        <p style={{color:'#00D395',fontWeight:'500',marginBottom:'8px'}}>
          Agent Status
        </p>
        <p style={{color:'#888',fontSize:'14px'}}>
          Monitoring World Championship matches · Creating micro-markets every 3-7 minutes
        </p>
      </div>
      <div style={{background:'#111',border:'1px solid #222',
      borderRadius:'12px',padding:'24px',marginBottom:'16px'}}>
        <p style={{color:'#00D395',fontWeight:'500',marginBottom:'8px'}}>
          Deployed Contracts
        </p>
        <p style={{fontSize:'13px',color:'#888',marginBottom:'4px'}}>MarketFactory:</p>
        <a href="https://www.oklink.com/xlayer/address/0xE03f0A8CA8a1214cCEE330BAfbC449D56B92DdC8"
          target="_blank" style={{color:'#00D395',fontSize:'13px',wordBreak:'break-all'}}>
          0xE03f0A8CA8a1214cCEE330BAfbC449D56B92DdC8
        </a>
        <p style={{fontSize:'13px',color:'#888',marginBottom:'4px',marginTop:'12px'}}>OracleRelayer:</p>
        <a href="https://www.oklink.com/xlayer/address/0x0f9B56D409AE1777fa4267683a45fE8ae915751d"
          target="_blank" style={{color:'#00D395',fontSize:'13px',wordBreak:'break-all'}}>
          0x0f9B56D409AE1777fa4267683a45fE8ae915751d
        </a>
      </div>
      <div style={{background:'#111',border:'1px solid #222',
      borderRadius:'12px',padding:'24px'}}>
        <p style={{color:'#00D395',fontWeight:'500',marginBottom:'8px'}}>
          How It Works
        </p>
        <p style={{color:'#888',fontSize:'14px',lineHeight:'1.6'}}>
          1. AI agent monitors live World Championship match data every 60 seconds<br/>
          2. Claude AI decides which micro-markets to open based on match momentum<br/>
          3. Markets are created onchain via MarketFactory contract<br/>
          4. Users stake USDT (min $0.01) on YES or NO outcomes<br/>
          5. Agent resolves markets trustlessly via OracleRelayer after expiry<br/>
          6. Winners claim proportional payouts automatically
        </p>
      </div>
    </main>
  )
}
