export const LOCK01_ADDRESS = '0xa60c8a47c4750ab90d0ec7b15a48d93b740466a7'
export const PUBLIC_RPC = 'https://ethereum-rpc.publicnode.com'

export const lock01Abi = [
  'function TOKEN01() view returns (address)',
  'function TIMEOUT_DEADLINE() view returns (uint256)',
  'function getCurrentPrice() view returns (uint256)',
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
