from dao import *


# 将列表转换为 JSON 格式的字符串
def list_to_string(lst:list[str]) -> str:
    return json.dumps(lst, ensure_ascii=False)

# 将 JSON 格式的字符串转换回列表
def string_to_list(s:str) -> list[str]:
    return json.loads(s)


def save_player_deck_work(qq_id:int, deck:list[str], password:str) -> str:
    player_status = get_player_status(qq_id)
    if getattr(player_status, 'newbee', True):
        raise Exception('请先使用“人机对战”通过新手教程')
    if getattr(player_status, 'password', '') != password:
        raise Exception('密码不正确')
    agents = []  # 用于存储所有代理人卡牌名
    exist = dict()
    have = get_player_have_work(qq_id,'')
    for name in deck:
        if name == '':
            continue
        card = get_card_catalog_by_name(name)
        if card is None:
            raise KeyError(f"卡牌 {name} 不存在")
        # 检测持有
        if card.name not in have:
            raise KeyError(f"卡牌 {name} 未收集")
        if card.type == CardCatalog.CardType.AGENT:
            agents.append(card.name)
            continue  # 代理人卡不计入功能牌exist
        # 检测投入限制
        if card.name in exist:
            raise KeyError(f"卡牌 {name} 超过投入限制")
        exist[card.name] = True
    if len(agents) < 1 or len(agents) > 3:
        raise KeyError(f"卡组代理人数量{len(agents)}不符合要求，需保证至少1张，至多3张。")
    length = len(exist)
    if length < 12 or length > 20:
        raise KeyError(f"卡组功能牌数量{length}不符合要求，需保证至少12张，至多20张。")
    card_names = list(exist.keys())
    save_player_deck(qq_id, list_to_string(card_names), list_to_string(agents))
    return f"上传卡组：共{length}张功能牌，代理人有：{','.join(agents)}。"
