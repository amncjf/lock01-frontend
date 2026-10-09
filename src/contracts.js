export const LOCK01_ADDRESS = '0xa60c8a47c4750ab90d0ec7b15a48d93b740466a7'
export const TOKEN01_ADDRESS = '0x32708538a107253b51a735A724330A23106ca4cA'
export const TOKEN01_SYMBOL = '01'
export const TOKEN01_DECIMALS = 18
export const PUBLIC_RPCS = [
  'https://ethereum-rpc.publicnode.com',
  'https://ethereum.publicnode.com',
  'https://rpc.mevblocker.io',
  'https://eth.llamarpc.com'
]
export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11'

export const lock01Abi = [
  'function TOKEN01() view returns (address)',
  'function TIMEOUT_DEADLINE() view returns (uint256)',
  'function getCurrentPrice() view returns (uint256)',
  'function getMinBalance(address addr) view returns (uint256)',
  'function userLockers(address) view returns (uint256 totalLocked,uint256 balance,bytes32 data)',
  'function lock(uint256 _amount,bytes32 _data)',
  'function claim()'
]

export const erc20Abi = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
]

export const multicall3Abi = [
  'function aggregate3(tuple(address target,bool allowFailure,bytes callData)[] calls) view returns (tuple(bool success,bytes returnData)[] returnData)'
]
